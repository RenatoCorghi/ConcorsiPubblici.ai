import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'tributario_raw_pdfs');
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const IDS_FILE = path.join(SCRATCH_DIR, 'tributaria_ids_active_session.json');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
    log('🚀 Avvio downloader collegato al browser...');
    
    if (!fs.existsSync(IDS_FILE)) {
        log('❌ File ID non trovato: ' + IDS_FILE);
        return;
    }

    const allIds = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
    log(`📋 Caricati ${allIds.length} ID da elaborare.`);

    let browser;
    try {
        browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    } catch (e) {
        log('❌ Errore di connessione. Chrome non ha la porta 9222 aperta.');
        return;
    }

    // Apri una nuova scheda per il download così non disturbiamo quella della ricerca
    const page = await browser.newPage();
    
    // Configura i download per andare dritti nella cartella senza prompt
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: OUTPUT_DIR,
        eventsEnabled: true,
    });

    let downloaded = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < allIds.length; i++) {
        const docId = allIds[i];
        const destPath = path.join(OUTPUT_DIR, `prov_${docId}.pdf`);

        if (fs.existsSync(destPath) && fs.statSync(destPath).size > 5000) {
            log(`[${i+1}/${allIds.length}] ⏭ Già presente: ${docId}`);
            skipped++;
            continue;
        }

        log(`\n[${i+1}/${allIds.length}] ⏳ Download: ${docId}`);
        const detailUrl = `${BASE_URL}/ricerca/dettaglio/${docId}`;
        
        try {
            await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await sleep(1000);
            
            // Cerca e clicca "Scarica provvedimento"
            let done = false;
            let downloadedFile = null;

            const onProgress = async (evt) => {
                if (evt.state === 'completed') {
                    done = true;
                    downloadedFile = evt.filename;
                }
            };
            cdp.on('Browser.downloadProgress', onProgress);

            const clicked = await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button, a'))
                    .find(el => {
                        const txt = el.textContent.trim().toLowerCase();
                        return txt.includes('scarica provvedimento') || txt.includes('download provvedimento');
                    });
                if (btn) { btn.click(); return true; }
                return false;
            });

            if (!clicked) {
                log('  ⚠️ Pulsante "Scarica provvedimento" non trovato, provo URL diretto...');
                const directUrl = `${BASE_URL}/private/giurisprudenza/provvedimento/${docId}`;
                await page.goto(directUrl, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
            }

            // Aspetta download (max 30s)
            const t0 = Date.now();
            while (!done && Date.now() - t0 < 30000) {
                await sleep(500);
            }

            if (done && downloadedFile && fs.existsSync(downloadedFile)) {
                await sleep(500);
                fs.renameSync(downloadedFile, destPath);
                log(`  ✅ Scaricato con successo.`);
                downloaded++;
            } else {
                // Fallback: file recente
                const recent = fs.readdirSync(OUTPUT_DIR)
                    .filter(f => f.endsWith('.pdf') && !f.startsWith('prov_') && !f.startsWith('massima_'))
                    .map(f => ({ f, t: fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs }))
                    .sort((a, b) => b.t - a.t)[0];

                if (recent && Date.now() - recent.t < 15000 && !recent.f.endsWith('.crdownload')) {
                    fs.renameSync(path.join(OUTPUT_DIR, recent.f), destPath);
                    log(`  ✅ Recuperato file recente.`);
                    downloaded++;
                } else {
                    log(`  ❌ Timeout o fallito.`);
                    failed++;
                }
            }
            cdp.off('Browser.downloadProgress', onProgress);

        } catch (e) {
            log(`  ❌ Errore: ${e.message}`);
            failed++;
        }

        await sleep(1500 + Math.random() * 1000); // Pausa tra un file e l'altro
    }

    log(`\n🏁 FINE! Scaricati: ${downloaded} | Saltati: ${skipped} | Falliti: ${failed}`);
    await page.close();
    browser.disconnect();
}

main().catch(console.error);
