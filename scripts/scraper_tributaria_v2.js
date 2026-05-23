/**
 * SCRAPER CORTI TRIBUTARIE v2 — Robusto e Scalabile
 *
 * Strategia: Puppeteer headless:false (bypassa Akamai/bot protection)
 * - Fase 1: Raccoglie tutti gli ID usando il filtro "Massimati" (solo sentenze con massima)
 * - Fase 2: Per ogni ID, scarica il PDF del provvedimento + massima
 *
 * NOTA: senza filtro ci sono 196K+ risultati per anno (troppi).
 * Con filtro massimati: ~10-50 per anno, alta qualità giuridica.
 * Gli ID vengono salvati su disco per riprendere da dove si era fermato.
 * Ogni PDF viene salvato in data/tributario_raw_pdfs/
 *
 * Uso: node scripts/scraper_tributaria_v2.js [--anno=2024] [--solo-massimati] [--start=0]
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Configurazione ──────────────────────────────────────────────────────────
const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'tributario_raw_pdfs');
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const LOG_FILE = path.join(SCRATCH_DIR, 'tributaria_scraper.log');

const args = process.argv.slice(2);
const TARGET_ANNO = args.find(a => a.startsWith('--anno='))?.split('=')[1] || '2024';
const SOLO_MASSIMATI = args.includes('--solo-massimati');
const START_FROM = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1] || '0');
const DRY_RUN = args.includes('--dry-run');

// Anni da scaricare se non specificato
const ANNI_DEFAULT = ['2025', '2024', '2023', '2022', '2021'];
const ANNI_TARGET = TARGET_ANNO === 'tutti' ? ANNI_DEFAULT : [TARGET_ANNO];

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(SCRATCH_DIR)) fs.mkdirSync(SCRATCH_DIR, { recursive: true });

// ── Logger ───────────────────────────────────────────────────────────────────
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    log('🚀 Scraper Corti Tributarie v2');
    log(`   Anni: ${ANNI_TARGET.join(', ')} | Solo Massimati: ${SOLO_MASSIMATI} | Start: ${START_FROM}`);
    log(`   Output: ${OUTPUT_DIR}\n`);

    const browser = await puppeteer.launch({
        headless: false,  // DEVE essere false per Akamai
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,900',
        ]
    });

    try {
        const [page] = await browser.pages();

        // Anti-detection
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );

        // CDP per download
        const cdp = await page.createCDPSession();
        await cdp.send('Browser.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: OUTPUT_DIR,
            eventsEnabled: true,
        });

        // ── Navigazione iniziale con warmup ──────────────────────────────────
        log('Navigazione homepage per stabilizzare sessione Akamai...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        
        const title = await page.title();
        log(`Titolo: "${title}"`);
        
        if (title.toLowerCase().includes('access denied') || title.toLowerCase().includes('error')) {
            log('⛔ Accesso negato. Intervieni manualmente nel browser entro 30s...');
            await sleep(30000);
        }

        // Warmup: comportamento umano
        await humanWarmup(page);

        // ── Ciclo per anno ────────────────────────────────────────────────────
        for (const anno of ANNI_TARGET) {
            log(`\n${'═'.repeat(60)}`);
            log(`📅 ANNO: ${anno}`);
            log(`${'═'.repeat(60)}`);

            const idsFile = path.join(SCRATCH_DIR, `tributaria_ids_${anno}.json`);
            let allIds = [];

            // Carica IDs salvati in precedenza se esistono
            if (fs.existsSync(idsFile)) {
                allIds = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
                log(`📋 Riprendo da ${allIds.length} ID già raccolti (anno ${anno})`);
            } else {
                // ── FASE 1: Raccolta IDs ──────────────────────────────────────
                log(`\n[FASE 1] Raccolta ID documenti per anno ${anno}...`);
                allIds = await collectIds(page, anno);
                fs.writeFileSync(idsFile, JSON.stringify(allIds, null, 2));
                log(`📋 ${allIds.length} ID raccolti e salvati in ${idsFile}`);
            }

            if (allIds.length === 0) {
                log(`⚠️ Nessun ID trovato per anno ${anno}, passo all'anno successivo.`);
                continue;
            }

            if (DRY_RUN) {
                log(`[DRY RUN] Trovati ${allIds.length} ID. Uscita senza download.`);
                continue;
            }

            // ── FASE 2: Download documenti ────────────────────────────────────
            log(`\n[FASE 2] Download di ${allIds.length} documenti (partendo da #${START_FROM + 1})...`);
            
            let downloaded = 0, skipped = 0, failed = 0;

            for (let i = START_FROM; i < allIds.length; i++) {
                const docId = allIds[i];
                log(`\n─── [${i + 1}/${allIds.length}] ${docId} ───`);

                const provFile = path.join(OUTPUT_DIR, `prov_${docId}.pdf`);
                const massFile = path.join(OUTPUT_DIR, `massima_${docId}.pdf`);
                const alreadyHasProv = fs.existsSync(provFile);
                const alreadyHasMass = fs.existsSync(massFile);

                if (alreadyHasProv && alreadyHasMass) {
                    log(`  ⏭️  Già scaricato, skip.`);
                    skipped++;
                    continue;
                }

                // Naviga alla pagina di dettaglio
                const detailUrl = `${BASE_URL}/ricerca/dettaglio/${docId}`;
                try {
                    await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                } catch (e) {
                    log(`  ⚠️ Timeout navigazione: ${e.message.substring(0, 60)}`);
                    await sleep(3000);
                }

                await page.waitForFunction(
                    () => document.body.innerText.trim().length > 500,
                    { timeout: 10000 }
                ).catch(() => {});
                await sleep(1200);

                // Screenshot solo del primo documento per debug
                if (i === START_FROM) {
                    await page.screenshot({
                        path: path.join(SCRATCH_DIR, 'tributaria_detail.png'),
                        fullPage: false
                    });
                    log('  📸 Screenshot salvato in scratch/tributaria_detail.png');
                }

                // Scarica provvedimento (testo completo)
                if (!alreadyHasProv) {
                    const ok = await downloadByClick(page, cdp, 'provvedimento', provFile);
                    if (ok) { downloaded++; log('  ✅ Provvedimento scaricato'); }
                    else { 
                        // Fallback: prova URL diretto
                        const directUrl = `${BASE_URL}/private/giurisprudenza/provvedimento/${docId}`;
                        const ok2 = await downloadByNavigation(page, cdp, directUrl, provFile);
                        if (ok2) { downloaded++; log('  ✅ Provvedimento (diretto)'); }
                        else { failed++; log('  ❌ Provvedimento fallito'); }
                    }
                }

                // Scarica massima
                if (!alreadyHasMass) {
                    const ok = await downloadByClick(page, cdp, 'massima', massFile);
                    if (ok) { downloaded++; log('  ✅ Massima scaricata'); }
                    else {
                        const directUrl = `${BASE_URL}/private/giurisprudenza/massima/${docId}`;
                        const ok2 = await downloadByNavigation(page, cdp, directUrl, massFile);
                        if (ok2) { downloaded++; log('  ✅ Massima (diretta)'); }
                        else { log('  ⚠️ Massima non disponibile (potrebbe non esserci)'); }
                    }
                }

                await sleep(1500);

                if ((i + 1) % 20 === 0) {
                    log(`\n📊 Progresso: ${i + 1}/${allIds.length} | ✅ ${downloaded} | ⏭️ ${skipped} | ❌ ${failed}\n`);
                }
            }

            log(`\n${'═'.repeat(60)}`);
            log(`📊 Anno ${anno} completato: ✅ ${downloaded} | ⏭️ ${skipped} | ❌ ${failed}`);
            log(`${'═'.repeat(60)}`);
        }

    } finally {
        await browser.close();
        log('\n🏁 Scraper terminato.');
    }
}

// ── Raccolta ID da tutte le pagine risultati ─────────────────────────────────
async function collectIds(page, anno) {
    const allIds = [];

    // Torna alla pagina di ricerca
    await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(2000);

    // Accetta cookie se presente
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.includes('Accetta') || b.textContent.includes('accetta'));
        if (btn) btn.click();
    });
    await sleep(500);

    // Seleziona anno — usa click + page.select() che è più affidabile
    log(`  Selezione anno ${anno}...`);
    try {
        await page.click('select[id="Form.ControlInput2"]');
        await sleep(300);
        await page.select('select[id="Form.ControlInput2"]', anno);
        await sleep(300);
    } catch (e) {
        // Fallback: focus + typing del valore
        await page.focus('select[id="Form.ControlInput2"]');
        await sleep(200);
        await page.keyboard.type(anno);
        await sleep(200);
    }
    await sleep(600);

    // Verifica selezione
    const yearCheck = await page.$eval('select[id="Form.ControlInput2"]', el => el.value).catch(() => '?');
    log(`  Anno selezionato: ${yearCheck}`);

    // Attiva checkbox massimati (filtra solo sentenze con massima ufficiale)
    // Questo riduce i risultati da 196K a ~10-50 per anno, tutti di alta qualità
    log('  Attivazione checkbox Massimati...');
    try {
        const isChecked = await page.$eval('input[id="Form.ControlInput5"]', el => el.checked);
        if (!isChecked) {
            await page.click('input[id="Form.ControlInput5"]');
            await sleep(400);
        }
        const checked = await page.$eval('input[id="Form.ControlInput5"]', el => el.checked);
        log(`  Massimati checkbox: ${checked}`);
    } catch (e) {
        log(`  ⚠️ Checkbox massimati non trovata: ${e.message}`);
    }

    // Click Ricerca
    await clickRicercaButton(page);
    
    // Aspetta risultati
    try {
        await page.waitForFunction(() => {
            const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
            const noResults = document.body.innerText.includes('Nessun risultato') ||
                             document.body.innerText.includes('nessun risultato');
            const errore = document.body.innerText.includes('si è verificato un errore');
            const tooMany = document.body.innerText.includes('supera il valore massimo') ||
                           document.body.innerText.includes('100.000');
            return links.length > 0 || noResults || errore || tooMany;
        }, { timeout: 60000 });
    } catch (e) {
        log(`  ⚠️ Timeout attesa risultati per anno ${anno}`);
        await page.screenshot({ path: path.join(SCRATCH_DIR, `tributaria_timeout_${anno}.png`) });
        return [];
    }

    // Controlla risultato
    const pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('Nessun risultato')) {
        log(`  ℹ️ Nessun risultato per anno ${anno}`);
        return [];
    }
    if (pageText.includes('si è verificato un errore')) {
        log(`  ⚠️ Errore server per anno ${anno}, riprovo...`);
        await sleep(3000);
        await clickRicercaButton(page);
        await page.waitForFunction(
            () => document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0,
            { timeout: 30000 }
        ).catch(() => {});
    }

    // Controlla il numero totale di risultati
    const totalText = await page.evaluate(() => {
        const el = document.querySelector('[class*="risultati"], [class*="total"], h5, h4, p');
        return el?.textContent || '';
    });
    log(`  Info risultati: ${totalText.substring(0, 100)}`);

    // Ciclo paginazione
    let pageNum = 1;
    while (true) {
        const ids = await page.evaluate(() => {
            const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
            return [...new Set(Array.from(links).map(l => {
                const parts = l.getAttribute('href').split('/');
                return parts[parts.length - 1];
            }))];
        });

        allIds.push(...ids);
        log(`  Pagina ${pageNum}: ${ids.length} ID (totale: ${allIds.length})`);

        // Prova pagina successiva — usa a.page-link (confermato dal DOM analysis)
        const hasNext = await page.evaluate(() => {
            const pageLinks = Array.from(document.querySelectorAll('a.page-link'));
            // Trova il link ">" che non sia disabilitato
            const nextBtn = pageLinks.find(a => {
                const txt = a.textContent.trim();
                const parentLi = a.closest('li');
                const isDisabled = parentLi?.classList.contains('disabled') || a.hasAttribute('disabled');
                return (txt === '>' || txt === '»' || txt.toLowerCase().includes('successiv')) && !isDisabled;
            });
            if (nextBtn) { nextBtn.click(); return true; }
            return false;
        });

        if (!hasNext) {
            log(`  ✅ Fine paginazione dopo ${pageNum} pagine`);
            break;
        }

        await page.waitForFunction(
            () => document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0,
            { timeout: 15000 }
        ).catch(() => {});
        await sleep(4000);
        pageNum++;

        if (pageNum > 200) {
            log('  ⚠️ Limite 200 pagine raggiunto, stop.');
            break;
        }
    }

    return [...new Set(allIds)]; // deduplica
}

// ── Click pulsante Ricerca ────────────────────────────────────────────────────
async function clickRicercaButton(page) {
    // Scrolla il bottone nel viewport
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.trim() === 'Ricerca');
        if (btn) btn.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await sleep(600);

    const coords = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.trim() === 'Ricerca');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });

    if (coords && coords.y > 0 && coords.y < 1000) {
        await page.mouse.click(coords.x, coords.y);
        log('  ✅ Click Ricerca');
    } else {
        // Fallback
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent.trim() === 'Ricerca');
            if (btn) btn.click();
        });
        log('  ✅ Click Ricerca (JS fallback)');
    }
    await sleep(1500);
}

// ── Download via click pulsante nella pagina ─────────────────────────────────
async function downloadByClick(page, cdp, type, destPath) {
    return new Promise(async (resolve) => {
        let done = false;
        const onProgress = (evt) => {
            if (evt.state === 'completed') done = true;
        };
        cdp.on('Browser.downloadProgress', onProgress);

        try {
            const keywords = type === 'massima'
                ? ['scarica massima', 'massima']
                : ['scarica provvedimento', 'provvedimento'];

            const clicked = await page.evaluate((kws) => {
                const el = Array.from(document.querySelectorAll('a, button'))
                    .find(e => kws.some(kw => e.textContent.trim().toLowerCase().includes(kw)));
                if (el) { el.click(); return true; }
                return false;
            }, keywords);

            if (!clicked) { cdp.off('Browser.downloadProgress', onProgress); resolve(false); return; }

            // Aspetta download
            const t0 = Date.now();
            while (!done && Date.now() - t0 < 20000) await sleep(400);

            if (done) {
                await sleep(800);
                const renamed = await moveLatestPdf(OUTPUT_DIR, destPath);
                cdp.off('Browser.downloadProgress', onProgress);
                resolve(renamed);
            } else {
                cdp.off('Browser.downloadProgress', onProgress);
                resolve(false);
            }
        } catch (e) {
            cdp.off('Browser.downloadProgress', onProgress);
            resolve(false);
        }
    });
}

// ── Download via navigazione diretta URL ─────────────────────────────────────
async function downloadByNavigation(page, cdp, url, destPath) {
    return new Promise(async (resolve) => {
        let done = false;
        const onProgress = (evt) => {
            if (evt.state === 'completed') done = true;
        };
        cdp.on('Browser.downloadProgress', onProgress);

        try {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 25000 }).catch(() => {});
            const t0 = Date.now();
            while (!done && Date.now() - t0 < 20000) await sleep(400);

            if (done) {
                await sleep(800);
                const renamed = await moveLatestPdf(OUTPUT_DIR, destPath);
                cdp.off('Browser.downloadProgress', onProgress);
                resolve(renamed);
            } else {
                cdp.off('Browser.downloadProgress', onProgress);
                resolve(false);
            }
        } catch (e) {
            cdp.off('Browser.downloadProgress', onProgress);
            resolve(false);
        }
    });
}

// ── Sposta il PDF più recente scaricato nella destinazione ───────────────────
async function moveLatestPdf(dir, destPath) {
    const files = fs.readdirSync(dir)
        .filter(f => (f.endsWith('.pdf') || f.endsWith('.crdownload'))
            && !f.startsWith('prov_') && !f.startsWith('massima_'))
        .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);

    const recent = files[0];
    if (recent && Date.now() - recent.t < 10000 && !recent.f.endsWith('.crdownload')) {
        try {
            fs.renameSync(path.join(dir, recent.f), destPath);
            const size = fs.statSync(destPath).size;
            log(`    📄 Salvato: ${path.basename(destPath)} (${Math.round(size / 1024)} KB)`);
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

// ── Simulazione comportamento umano ──────────────────────────────────────────
async function humanWarmup(page) {
    log('Simulazione comportamento umano (8s)...');
    for (let i = 0; i < 5; i++) {
        const x = 300 + Math.random() * 700;
        const y = 200 + Math.random() * 400;
        await page.mouse.move(x, y, { steps: 4 });
        await sleep(700 + Math.random() * 600);
    }
    await page.evaluate(() => window.scrollBy(0, 100));
    await sleep(500);
    await page.evaluate(() => window.scrollBy(0, -100));
    await sleep(600);
    log('✅ Warmup completato.\n');
}

// ── Helper sleep ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => {
    log(`❌ ERRORE FATALE: ${e.message}`);
    console.error(e);
    process.exit(1);
});
