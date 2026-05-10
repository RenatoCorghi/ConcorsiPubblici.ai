#!/usr/bin/env node
/* ============================================================
   SCRAPER RIVISTE CORTE DEI CONTI
   Scarica i PDF completi delle Riviste della Corte dei Conti
   andando a ritroso fino al 2021 compreso.
   
   Uso: node scripts/scraper-corteconti-riviste.js
   ============================================================ */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const BASE_URL = 'https://www.corteconti.it';
const ARCHIVE_URL = `${BASE_URL}/home/attivita/rivista/archiviorivista`;
const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'riviste_corteconti');
const TARGET_YEAR = 2021;

// Assicura che la cartella esista
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Funzione helper per delay
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadFile(url, destPath) {
    if (fs.existsSync(destPath)) {
        console.log(`      ⏭️ Già scaricato: ${path.basename(destPath)}`);
        return true;
    }
    
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const dest = fs.createWriteStream(destPath);
        
        if (res.body.pipeTo) {
             // We can use node's pipeline, which supports Web Streams
             await pipeline(res.body, dest);
        } else {
             for await (const chunk of res.body) {
                dest.write(chunk);
             }
             dest.end();
        }
        return true;
    } catch (e) {
        console.error(`      ❌ Errore download: ${e.message}`);
        return false;
    }
}

async function scrape() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  📚 SCRAPER RIVISTE CORTE DEI CONTI');
    console.log(`  🎯 Target: PDF Fino al ${TARGET_YEAR}`);
    console.log(`  💾 Output: ${DOWNLOAD_DIR}`);
    console.log('═══════════════════════════════════════════════════');

    console.log('\n[1/3] 🚀 Avvio browser...');
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Intercetta richieste inutili per velocizzare
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    console.log(`[2/3] 🌐 Navigazione archivio...`);
    await page.goto(ARCHIVE_URL, { waitUntil: 'networkidle2' });

    let pageNum = 1;
    let allIssues = [];
    let stopScraping = false;

    while (!stopScraping) {
        console.log(`   📄 Analisi Pagina ${pageNum}...`);
        
        const issuesOnPage = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href*="dettagliorivista?Id="]')).map(a => {
                const text = a.parentElement.textContent.replace('Leggi di più', '').trim();
                return {
                    title: text,
                    url: a.href
                };
            });
        });
        
        if (issuesOnPage.length === 0) {
            console.log('   ⚠️ Nessun fascicolo trovato in questa pagina. Termino scansione.');
            break;
        }

        for (const issue of issuesOnPage) {
            // Estrae l'anno dal titolo (es: "FASCICOLO N. 1/2026")
            const yearMatch = issue.title.match(/20\d{2}/);
            const year = yearMatch ? parseInt(yearMatch[0]) : null;
            
            if (year && year < TARGET_YEAR) {
                console.log(`   🛑 Raggiunto anno ${year} (< ${TARGET_YEAR}). Stop paginazione.`);
                stopScraping = true;
                break;
            }
            
            // Aggiungo per evitare di processare lo stesso ID se c'è bug paginazione
            if (!allIssues.find(i => i.url === issue.url)) {
                allIssues.push(issue);
            }
        }
        
        if (!stopScraping) {
            pageNum++;
            const hasNext = await page.evaluate((nextPage) => {
                if (typeof Search === 'function') {
                    Search(nextPage);
                    return true;
                }
                return false;
            }, pageNum);
            
            if (!hasNext) break;
            await sleep(3500); // Wait for AJAX load
        }
    }
    
    console.log(`\n[3/3] 🔍 Trovati ${allIssues.length} fascicoli da scaricare. Inizio download PDF...`);
    
    for (let i = 0; i < allIssues.length; i++) {
        const issue = allIssues[i];
        console.log(`\n   📥 [${i+1}/${allIssues.length}] Elaborazione: ${issue.title}`);
        
        await page.goto(issue.url, { waitUntil: 'networkidle2' });
        
        // Estrai link download PDF. 
        const downloadLink = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="Download?id="]'));
            if(links.length === 0) return null;
            
            // Cerca il link che nel testo contiene "FASCICOLO" o "INDICE"
            const mainLink = links.find(l => {
                const text = l.textContent.toUpperCase();
                return text.includes('FASCICOLO') || text.includes('INDICE');
            });
            if (mainLink) return mainLink.href;
            
            // Fallback al primo
            return links[0].href;
        });
        
        if (!downloadLink) {
            console.log(`      ⚠️ Nessun link PDF trovato per questo fascicolo.`);
            continue;
        }
        
        // Costruisci nome file pulito
        let safeName = issue.title.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toLowerCase();
        const filename = `corteconti_rivista_${safeName}.pdf`;
        const destPath = path.join(DOWNLOAD_DIR, filename);
        
        await downloadFile(downloadLink, destPath);
        await sleep(1500); // Politeness delay
    }

    console.log('\n✅ Scraper completato con successo!');
    await browser.close();
}

scrape().catch(e => {
    console.error('💥 Errore fatale:', e);
    process.exit(1);
});
