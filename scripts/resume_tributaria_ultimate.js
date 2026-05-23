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
    log('🚀 Avvio Ultimate Extractor & Downloader collegato al browser...');
    
    let allIds = new Set();
    if (fs.existsSync(IDS_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
            saved.forEach(id => allIds.add(id));
            log(`📋 Caricati ${allIds.size} ID dallo storico.`);
        } catch (e) {}
    }

    let browser;
    try {
        browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    } catch (e) {
        log('❌ Errore di connessione. Chrome non ha la porta 9222 aperta.');
        return;
    }

    const pages = await browser.pages();
    let searchPage = null;

    for (const p of pages) {
        if (p.url().includes('/ricerca')) {
            const hasLinks = await p.evaluate(() => document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0).catch(() => false);
            if (hasLinks) { searchPage = p; break; }
        }
    }

    if (!searchPage) {
        log('❌ Non ho trovato nessuna scheda aperta con i risultati della ricerca (/ricerca).');
        browser.disconnect();
        return;
    }
    
    await searchPage.bringToFront();

    // Nuova scheda dedicata ai download per non perdere i risultati di ricerca
    const downloadPage = await browser.newPage();
    const cdp = await downloadPage.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: OUTPUT_DIR,
        eventsEnabled: true,
    });

    let pageNum = 1;

    while (true) {
        log(`\n${'═'.repeat(40)}\n📄 Pagina Ricerca Corrente (Ciclo ${pageNum})\n${'═'.repeat(40)}`);
        
        // 1. Estrai ID della pagina corrente
        const idsOnPage = await searchPage.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href^="/ricerca/dettaglio/"]'))
                .map(a => a.getAttribute('href').split('/').pop())
                .filter(id => id && id.includes('-'));
        });

        if (idsOnPage.length === 0) {
            log('⚠️ Nessun ID trovato. Attendo...');
            await sleep(3000);
            continue;
        }

        // 2. Scarica i file per gli ID trovati
        for (let i = 0; i < idsOnPage.length; i++) {
            const docId = idsOnPage[i];
            allIds.add(docId);
            
            const destPath = path.join(OUTPUT_DIR, `prov_${docId}.pdf`);

            if (fs.existsSync(destPath) && fs.statSync(destPath).size > 5000) {
                log(`[${i+1}/${idsOnPage.length}] ⏭ Già presente: ${docId.substring(0,25)}...`);
                continue;
            }

            log(`[${i+1}/${idsOnPage.length}] ⏳ Download: ${docId}`);
            
            try {
                await downloadPage.bringToFront();
                const detailUrl = `${BASE_URL}/ricerca/dettaglio/${docId}`;
                await downloadPage.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await sleep(1000);
                
                let done = false;
                let downloadedFile = null;
                const onProgress = async (evt) => {
                    if (evt.state === 'completed') {
                        done = true;
                        downloadedFile = evt.filename;
                    }
                };
                cdp.on('Browser.downloadProgress', onProgress);

                const clicked = await downloadPage.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button, a'))
                        .find(el => {
                            const txt = el.textContent.trim().toLowerCase();
                            return txt.includes('scarica provvedimento') || txt.includes('download provvedimento');
                        });
                    if (btn) { btn.click(); return true; }
                    return false;
                });

                if (!clicked) {
                    const directUrl = `${BASE_URL}/private/giurisprudenza/provvedimento/${docId}`;
                    await downloadPage.goto(directUrl, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
                }

                const t0 = Date.now();
                while (!done && Date.now() - t0 < 30000) { await sleep(500); }

                if (done && downloadedFile && fs.existsSync(downloadedFile)) {
                    await sleep(500);
                    fs.renameSync(downloadedFile, destPath);
                    log(`  ✅ Scaricato con successo.`);
                } else {
                    const recent = fs.readdirSync(OUTPUT_DIR)
                        .filter(f => f.endsWith('.pdf') && !f.startsWith('prov_') && !f.startsWith('massima_'))
                        .map(f => ({ f, t: fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs }))
                        .sort((a, b) => b.t - a.t)[0];

                    if (recent && Date.now() - recent.t < 15000 && !recent.f.endsWith('.crdownload')) {
                        fs.renameSync(path.join(OUTPUT_DIR, recent.f), destPath);
                        log(`  ✅ Recuperato file recente.`);
                    } else {
                        log(`  ❌ Fallito o Timeout.`);
                    }
                }
                cdp.off('Browser.downloadProgress', onProgress);
            } catch (e) {
                log(`  ❌ Errore: ${e.message}`);
            }
            await sleep(1500);
        }

        // Salva stato
        fs.writeFileSync(IDS_FILE, JSON.stringify(Array.from(allIds), null, 2));
        
        // 3. Torna alla pagina ricerca e vai avanti
        await searchPage.bringToFront();
        await sleep(1000);

        const hasNext = await searchPage.evaluate(() => {
            const pageLinks = Array.from(document.querySelectorAll('a.page-link, .pagination a'));
            const nextBtn = pageLinks.find(a => {
                const txt = a.textContent.trim();
                const li = a.closest('li');
                const isDisabled = li?.classList.contains('disabled') || a.classList.contains('disabled');
                return (txt === '>' || txt === '»' || txt.toLowerCase().includes('successiv')) && !isDisabled;
            });
            
            if (nextBtn) {
                nextBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
                nextBtn.click();
                return true;
            }
            return false;
        });

        if (!hasNext) {
            log('✅ Fine di tutte le pagine. Nessun altro pulsante "Successiva".');
            break;
        }

        // Aspetta caricamento nuova pagina
        log('➡️ Passaggio alla pagina successiva...');
        const oldFirstId = idsOnPage[0];
        try {
            await searchPage.waitForFunction((prevId) => {
                const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
                if (links.length === 0) return false;
                return links[0].getAttribute('href').split('/').pop() !== prevId;
            }, { timeout: 20000 }, oldFirstId);
        } catch (e) {
            log('⚠️ Timeout transizione pagina, procedo comunque sperando si sia caricata...');
        }

        pageNum++;
        await sleep(2000);
    }

    log(`\n🎉 ESTRAZIONE & DOWNLOAD GLOBALE COMPLETATI!`);
    await downloadPage.close();
    browser.disconnect();
}

main().catch(console.error);
