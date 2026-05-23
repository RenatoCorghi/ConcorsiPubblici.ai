/**
 * DOWNLOAD AUTOMATICO DELLE MASSIME UFFICIALI (CGT)
 * 
 * Si collega alla sessione Chrome attiva (porta 9222),
 * legge tutti gli ID da scratch/tributaria_ids_active_session.json,
 * e scarica il PDF della massima per ciascun ID navigando alla pagina di dettaglio
 * ed eseguendo il click sul pulsante "Scarica Massima".
 * 
 * Uso:
 *   node scripts/download_all_massime.js
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'tributario_raw_pdfs');
const IDS_FILE = path.join(__dirname, '..', 'scratch', 'tributaria_ids_active_session.json');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
    log('🚀 Avvio Downloader di Massime Ufficiali CGT (Versione Click Detail)...');

    if (!fs.existsSync(IDS_FILE)) {
        log(`❌ File degli ID non trovato: ${IDS_FILE}`);
        return;
    }

    const docIds = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
    log(`📋 Trovati ${docIds.length} ID totali nello storico.`);

    let browser;
    try {
        browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    } catch (e) {
        log('❌ Errore di connessione a Chrome sulla porta 9222. Assicurati che sia aperto.');
        return;
    }

    const page = await browser.newPage();
    
    // Set user agent matching normal Chrome
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: OUTPUT_DIR,
        eventsEnabled: true,
    });

    let downloaded = 0, skipped = 0, failed = 0;

    for (let i = 0; i < docIds.length; i++) {
        const docId = docIds[i];
        const destPath = path.join(OUTPUT_DIR, `massima_${docId}.pdf`);

        // Skip se già scaricata o segnata come mancante
        if ((fs.existsSync(destPath) && fs.statSync(destPath).size > 1000) || fs.existsSync(`${destPath}.mancante`)) {
            skipped++;
            continue;
        }

        log(`[${i + 1}/${docIds.length}] ⏳ Gestione ID: ${docId.substring(0, 20)}...`);

        const detailUrl = `${BASE_URL}/ricerca/dettaglio/${docId}`;
        try {
            await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            
            // Attendi che la pagina si carichi
            await page.waitForFunction(() =>
                document.body.innerText.trim().length > 300,
                { timeout: 8000 }
            ).catch(() => {});
            
            await sleep(1000); // Piccolo ritardo per stabilità React

            // Verifica se c'è il pulsante per scaricare la massima
            const hasMassimaBtn = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button, a'))
                    .find(el => el.textContent.trim().toLowerCase().includes('scarica massima'));
                return !!btn;
            });

            if (!hasMassimaBtn) {
                // Alcune sentenze potrebbero non avere una massima ufficiale associata
                log(`  ⚠️ Pulsante "Scarica Massima" non trovato. Documento probabilmente privo di massima.`);
                failed++;
                
                // Creiamo un file segnaposto vuoto o di 1 byte per evitare di riricercarlo continuamente?
                // Meglio di no, oppure possiamo marcare il fallimento. Scriviamo un file massima_*.pdf.mancante così non ci riproviamo.
                fs.writeFileSync(`${destPath}.mancante`, 'No court maxim available');
                continue;
            }

            // Procediamo al download via click
            const ok = await clickAndDownload(page, cdp, 'Scarica Massima', destPath, OUTPUT_DIR);
            if (ok) {
                log(`  ✅ Massima salvata con successo!`);
                downloaded++;
            } else {
                log(`  ❌ Download fallito.`);
                failed++;
            }

        } catch (error) {
            log(`  ❌ Errore durante l'elaborazione dell'ID: ${error.message}`);
            failed++;
        }

        // Delay minimo tra le richieste per evitare rate limit e Akamai ban
        await sleep(1500);
    }

    log(`\n🎉 PROCESSO DI DOWNLOAD COMPLETATO!`);
    log(`   ✅ Scaricate con successo: ${downloaded}`);
    log(`   ⏭️  Già presenti:          ${skipped}`);
    log(`   ❌ Fallite o mancanti:     ${failed}`);

    await page.close();
    browser.disconnect();
}

async function clickAndDownload(page, cdp, buttonText, destPath, outputDir) {
    return new Promise(async (resolve) => {
        let done = false;
        let downloadFilename = null;
        
        const onProgress = (evt) => {
            if (evt.state === 'inProgress') {
                downloadFilename = evt.filename;
            }
            if (evt.state === 'completed') {
                done = true;
            }
        };
        cdp.on('Browser.downloadProgress', onProgress);
        
        try {
            // Clicca il pulsante con il testo specificato
            const clicked = await page.evaluate((text) => {
                const btn = Array.from(document.querySelectorAll('button, a'))
                    .find(el => el.textContent.trim().toLowerCase().includes(text.toLowerCase()));
                if (btn) { btn.click(); return true; }
                return false;
            }, buttonText);
            
            if (!clicked) {
                cdp.off('Browser.downloadProgress', onProgress);
                resolve(false);
                return;
            }
            
            // Aspetta il download con timeout
            const t0 = Date.now();
            while (!done && Date.now() - t0 < 15000) {
                await sleep(250);
            }
            
            if (done) {
                await sleep(500); // Aspetta che il file sia scritto completamente
                
                // Cerca il file più recente nella directory (scaricato nel momento corrente)
                const allFiles = fs.readdirSync(outputDir)
                    .filter(f => f.endsWith('.pdf') && !f.startsWith('prov_') && !f.startsWith('massima_'))
                    .map(f => ({ f, t: fs.statSync(path.join(outputDir, f)).mtime.getTime() }))
                    .sort((a, b) => b.t - a.t);
                
                const recent = allFiles[0];
                if (recent && Date.now() - recent.t < 15000) {
                    const src = path.join(outputDir, recent.f);
                    fs.renameSync(src, destPath);
                    resolve(true);
                    return;
                }
            }
            
            resolve(false);
        } catch (e) {
            resolve(false);
        } finally {
            cdp.off('Browser.downloadProgress', onProgress);
        }
    });
}

main().catch(console.error);
