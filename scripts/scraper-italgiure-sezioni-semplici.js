/**
 * scraper-italgiure-sezioni-semplici.js
 * 
 * Scarica le sentenze delle sezioni semplici (Cassazione) da ItalGiure.
 * Filtri: 
 *  - Anno: 2025, 2026
 *  - Tipo Provvedimento: "Sentenza"
 *  - Esclude: SS.UU. (-szdec:"U")
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// ==========================================
// CONFIGURAZIONE
// ==========================================
const OUTPUT_DIR = path.resolve('./sentenze_sez_semplici');
const ROWS_PER_PAGE = 100;
const DELAY_MS = 200; // Ridotto perché fetchiamo in batch

const SNCASS_HOME = 'https://www.italgiure.giustizia.it/sncass/';
const SOLR_EP = 'https://www.italgiure.giustizia.it/sncass/isapi/hc.dll/sn.solr/sn-collection/select?app.query';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ==========================================
// Indice Locale
// ==========================================
function buildLocalIndex() {
    const existing = new Set();
    function scanDir(dir) {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) scanDir(path.join(dir, entry.name));
            else if (entry.name.endsWith('.md')) {
                existing.add(entry.name.replace('.md', ''));
            }
        }
    }
    scanDir(OUTPUT_DIR);
    return existing;
}

// ==========================================
// API Client (iniettato nella pagina)
// ==========================================
async function callSolr(page, queryParams) {
    const body = new URLSearchParams(queryParams).toString();
    return await page.evaluate(async (ep, b) => {
        try {
            const res = await fetch(ep, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*; q=0.01'
                },
                body: b
            });
            if (!res.ok) return { error: `HTTP ${res.status}` };
            return await res.json();
        } catch (e) {
            return { error: e.message };
        }
    }, SOLR_EP, body);
}

// ==========================================
// 1. Fetch Lista Base (Paginata) con Testo!
// ==========================================
async function fetchList(page, start, yearQuery) {
    const params = {
        start: String(start),
        rows: String(ROWS_PER_PAGE),
        q: `anno:(${yearQuery}) AND tipoprov:"Sentenza" AND -szdec:"U"`,
        wt: 'json',
        indent: 'off',
        sort: 'anno desc, numdec desc', // Partiamo dalle più recenti
        fl: 'id,tipoprov,nprov,anno,dtdec,dtpub,rubrica,oggetto,massa,ocr,testo,ocrfull', // includiamo il testo per velocizzare
    };
    
    const data = await callSolr(page, params);
    if (data.error) throw new Error(data.error);
    return data.response;
}

// ==========================================
// MAIN
// ==========================================
async function main() {
    const yearQuery = process.argv[2] || '2025 OR 2026';
    console.log(`\n🚀 Scraper ItalGiure — Sezioni Semplici per anno/i: ${yearQuery} (Fast Batch)`);
    console.log(`${'='.repeat(55)}\n`);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const localIndex = buildLocalIndex();

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    console.log('📡 Acquisizione cookie di sessione da ItalGiure...');
    await page.goto(SNCASS_HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    let firstPage;
    try {
        firstPage = await fetchList(page, 0, yearQuery);
    } catch (e) {
        console.error('❌ Errore prima query Solr:', e.message);
        await browser.close();
        process.exit(1);
    }

    const total = firstPage.numFound;
    console.log(`✅ Trovate ${total} Sentenze Sez. Semplici (Già in locale: ${localIndex.size})\n`);

    let downloaded = 0, skipped = 0, noText = 0, errors = 0;

    for (let start = 0; start < total; start += ROWS_PER_PAGE) {
        const pageNum = Math.floor(start / ROWS_PER_PAGE) + 1;
        
        let result;
        if (start === 0) result = firstPage;
        else {
            try {
                result = await fetchList(page, start, yearQuery);
            } catch (e) {
                console.error(`\n❌ Errore pagina ${pageNum}:`, e.message);
                errors++;
                await sleep(3000);
                continue;
            }
        }

        const newDocs = result.docs.filter(d => !localIndex.has(d.id));
        const skipCount = result.docs.length - newDocs.length;
        skipped += skipCount;

        if (newDocs.length === 0) {
            process.stdout.write(`⏭️  Pagina ${pageNum}: ${skipCount} skip\n`);
            continue;
        }

        console.log(`\n─── Pagina ${pageNum}: ${newDocs.length} nuove sentenze da scansionare ───`);

        for (const fullDoc of newDocs) {
            const localKey = fullDoc.id;
            
            // Estrazione del numero dall'ID (es. snciv2025200025S -> 00025)
            const match = localKey.match(/(\d{4})\d(\d+)[SO]$/);
            const numStr = match ? match[2] : String(fullDoc.nprov || '00000');
            const numForLog = parseInt(numStr, 10).toString();
            const annoStr = String(fullDoc.anno || (match ? match[1] : 'unknown'));

            // Estrazione testo diretto dal batch
            let testoArray = fullDoc.ocr || fullDoc.ocrfull || fullDoc.testo;
            let testo = Array.isArray(testoArray) ? testoArray.join('\n\n') : (testoArray || '');
            
            if (!testo || testo.length < 200 || testo.includes('fase di oscuramento')) {
                // Fallback su campo massa o riassunto se il testo pieno non c'è
                if (fullDoc.massa && fullDoc.massa.length > 200) {
                    const rub = fullDoc.rubrica ? `**${fullDoc.rubrica}**\n\n` : '';
                    const ogg = fullDoc.oggetto ? `*${fullDoc.oggetto}*\n\n` : '';
                    testo = rub + ogg + (Array.isArray(fullDoc.massa) ? fullDoc.massa.join('\n') : fullDoc.massa);
                } else {
                    noText++;
                    continue;
                }
            } 

            // Cleanup testo
            testo = testo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/<em class="hit">/g, '').replace(/<\/em>/g, '').trim();

            // Salva su disco
            const outDir = path.join(OUTPUT_DIR, annoStr);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

            const dataPub = fullDoc.dtpub ? fullDoc.dtpub.split('T')[0] : (fullDoc.dtdec ? fullDoc.dtdec.split('T')[0] : '');
            const tipoSez = localKey.startsWith('snpen') ? 'Pen.' : 'Civ.';
            const header = `# [Cass. ${tipoSez}, Sez. Semplice, ${dataPub}, n. ${numForLog}]\n\n`;
            
            fs.writeFileSync(path.join(outDir, `${localKey}.md`), header + testo, 'utf8');
            localIndex.add(localKey);
            downloaded++;
            console.log(`    ✅ [${localKey}] Salvata n.${numForLog}/${annoStr}`);
        }
        await sleep(DELAY_MS);
    }

    await browser.close();
    console.log(`\n\n${'='.repeat(55)}`);
    console.log(`✨ COMPLETATO!`);
    console.log(`   ✅ Scaricate nuove: ${downloaded}`);
    console.log(`   ⏭️  Skip (già presenti): ${skipped}`);
    console.log(`   ⚠️  Vuote/Oscurate: ${noText}`);
    console.log(`   ❌ Errori XHR: ${errors}`);
}

main().catch(console.error);
