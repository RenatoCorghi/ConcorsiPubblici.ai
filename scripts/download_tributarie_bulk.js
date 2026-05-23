/**
 * DOWNLOADER TRIBUTARIE — Bulk Download Provvedimenti
 *
 * Strategia confermata funzionante:
 * - Puppeteer headless:false bypassa Akamai
 * - Naviga alla pagina di ricerca, filtra per anno + massimati
 * - Per ogni risultato, naviga al dettaglio e clicca "Scarica provvedimento"
 * - Il PDF viene scaricato nella cartella OUTPUT_DIR
 *
 * Riprende da dove si era fermato (salta i PDF già presenti).
 *
 * Uso:
 *   node scripts/download_tributarie_bulk.js --anno=2024
 *   node scripts/download_tributarie_bulk.js --anni=tutti   (2021-2025)
 *   node scripts/download_tributarie_bulk.js --anno=2023 --start=50
 */
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'tributario_raw_pdfs');
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const LOG_FILE = path.join(SCRATCH_DIR, 'tributarie_bulk.log');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(SCRATCH_DIR, { recursive: true });

// ── Argomenti CLI ─────────────────────────────────────────────────────────────
const ARGS = Object.fromEntries(
    process.argv.slice(2)
        .filter(a => a.startsWith('--'))
        .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const ANNI_DEFAULT = ['2025', '2024', '2023', '2022', '2021'];
const ANNI_TARGET = ARGS.anni === 'tutti' ? ANNI_DEFAULT
    : ARGS.anno ? [ARGS.anno]
    : ['2025'];
const START_FROM = parseInt(ARGS.start || '0');

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    log(`🚀 Downloader Tributarie — Anni: ${ANNI_TARGET.join(', ')} | Start: ${START_FROM}`);

    const browser = await puppeteer.launch({
        headless: false,
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
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

        // CDP per intercettare download
        const cdp = await page.createCDPSession();
        await cdp.send('Browser.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: OUTPUT_DIR,
            eventsEnabled: true,
        });

        // Warmup Akamai
        log('Navigazione homepage (warmup)...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        log(`Titolo: "${await page.title()}"`);
        await humanWarmup(page);

        // ── Ciclo anni ────────────────────────────────────────────────────────
        for (const anno of ANNI_TARGET) {
            log(`\n${'═'.repeat(60)}`);
            log(`📅 ANNO: ${anno}`);
            log(`${'═'.repeat(60)}`);

            // Carica o raccoglie gli ID
            const idsFile = path.join(SCRATCH_DIR, `tributaria_ids_${anno}.json`);
            let allIds = [];

            if (fs.existsSync(idsFile)) {
                allIds = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
                log(`📋 ${allIds.length} ID già raccolti per anno ${anno}`);
            } else {
                log(`[FASE 1] Raccolta ID per anno ${anno}...`);
                allIds = await collectIds(page, anno);
                if (allIds.length > 0) {
                    fs.writeFileSync(idsFile, JSON.stringify(allIds, null, 2));
                    log(`✅ ${allIds.length} ID raccolti e salvati`);
                }
            }

            if (allIds.length === 0) {
                log(`⚠️ Nessun ID per anno ${anno}, skip.`);
                continue;
            }

            // ── Scarica ogni documento ────────────────────────────────────────
            log(`[FASE 2] Download di ${allIds.length} provvedimenti (start: ${START_FROM})...`);
            let downloaded = 0, skipped = 0, failed = 0;

            for (let i = (anno === ANNI_TARGET[0] ? START_FROM : 0); i < allIds.length; i++) {
                const docId = allIds[i];
                const outFile = path.join(OUTPUT_DIR, `prov_${docId}.pdf`);

                if (fs.existsSync(outFile) && fs.statSync(outFile).size > 10000) {
                    log(`[${i+1}/${allIds.length}] ⏭  Già presente: ${docId.substring(0, 30)}...`);
                    skipped++;
                    continue;
                }

                log(`\n─── [${i+1}/${allIds.length}] ${docId} ───`);

                // Naviga alla pagina di dettaglio
                const detailUrl = `${BASE_URL}/ricerca/dettaglio/${docId}`;
                try {
                    await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                } catch (e) {
                    log(`  ⚠️ Navigazione lenta: ${e.message.substring(0, 50)}`);
                    await sleep(2000);
                }

                await page.waitForFunction(
                    () => document.body.innerText.trim().length > 300,
                    { timeout: 10000 }
                ).catch(() => {});
                await sleep(800);

                // Screenshot solo del primo
                if (i === (anno === ANNI_TARGET[0] ? START_FROM : 0)) {
                    await page.screenshot({ path: path.join(SCRATCH_DIR, 'detail_first.png') });
                    log('  📸 Screenshot primo documento salvato.');
                }

                // Scarica il provvedimento
                const ok = await downloadProvvedimento(page, cdp, outFile);
                if (ok) {
                    downloaded++;
                    const size = fs.statSync(outFile).size;
                    log(`  ✅ Scaricato (${Math.round(size/1024)} KB)`);
                } else {
                    failed++;
                    log(`  ❌ Download fallito`);
                }

                await sleep(1200);

                if ((i + 1) % 10 === 0) {
                    log(`\n📊 [${anno}] ${i+1}/${allIds.length} | ✅ ${downloaded} | ⏭ ${skipped} | ❌ ${failed}\n`);
                }
            }

            log(`\n${'─'.repeat(50)}`);
            log(`📊 Anno ${anno}: ✅ ${downloaded} | ⏭ ${skipped} | ❌ ${failed}`);
            log(`${'─'.repeat(50)}`);
        }

    } finally {
        await browser.close();
        log('\n🏁 Download completato.');
    }
}

// ── Raccoglie tutti gli ID da tutte le pagine risultati ───────────────────────
async function collectIds(page, anno) {
    const allIds = [];

    // Vai alla ricerca
    await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(2000);

    // Accetta cookie
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.includes('Accetta'));
        if (btn) btn.click();
    }).catch(() => {});
    await sleep(500);

    // Seleziona anno con click diretto sull'option
    log(`  Selezione anno ${anno}...`);
    const yearSelected = await page.evaluate((targetYear) => {
        const sel = document.querySelector('select[id="Form.ControlInput2"]');
        if (!sel) return false;
        const opt = Array.from(sel.options).find(o => o.value === targetYear);
        if (!opt) return false;
        // Forza la selezione via proprietà nativa
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(sel, targetYear);
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        return false;
    }, anno);
    
    if (!yearSelected) {
        // Fallback: click fisico sulle opzioni
        await page.focus('select[id="Form.ControlInput2"]');
        await page.keyboard.press('Home');
        await sleep(300);
        const opts = await page.evaluate((y) => {
            const sel = document.querySelector('select[id="Form.ControlInput2"]');
            return Array.from(sel?.options || []).findIndex(o => o.value === y);
        }, anno);
        for (let k = 0; k < opts && opts > 0; k++) {
            await page.keyboard.press('ArrowDown');
            await sleep(50);
        }
    }
    await sleep(1000);

    const yearCheck = await page.$eval('select[id="Form.ControlInput2"]', el => el.value).catch(() => '?');
    log(`  Anno selezionato: ${yearCheck}`);

    // Checkbox massimati
    log('  Attivazione checkbox Massimati...');
    const checkboxState = await page.evaluate(() => {
        const cb = document.querySelector('input[id="Form.ControlInput5"]');
        if (!cb) return 'not found';
        if (!cb.checked) {
            // Usa nativeSetter per React
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'checked'
            )?.set;
            if (setter) {
                setter.call(cb, true);
                cb.dispatchEvent(new Event('input', { bubbles: true }));
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                cb.click();
            }
        }
        return cb.checked ? 'checked' : 'unchecked';
    });
    log(`  Massimati: ${checkboxState}`);
    await sleep(600);

    // Click Ricerca
    await clickRicerca(page);

    // Aspetta risultati
    let hasResults = false;
    try {
        await page.waitForFunction(() => {
            const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
            const noRes = document.body.innerText.includes('Nessun risultato');
            const err = document.body.innerText.includes('si è verificato un errore');
            return links.length > 0 || noRes || err;
        }, { timeout: 60000 });
        hasResults = await page.evaluate(() =>
            document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0
        );
    } catch (e) {
        log(`  ⚠️ Timeout risultati per anno ${anno}`);
        return [];
    }

    if (!hasResults) {
        log(`  ℹ️ Nessun risultato per anno ${anno}`);
        return [];
    }

    // Estrai conteggio totale
    const totalInfo = await page.evaluate(() => {
        const txt = document.body.innerText;
        const m = txt.match(/(\d[\d.]*)\s*risultat/i);
        return m ? m[0] : 'N/D';
    });
    log(`  ℹ️ ${totalInfo}`);

    // Paginazione
    let pageNum = 1;
    while (true) {
        const ids = await page.evaluate(() => {
            return [...new Set(
                Array.from(document.querySelectorAll('a[href^="/ricerca/dettaglio/"]'))
                    .map(a => a.getAttribute('href').split('/').pop())
            )];
        });
        allIds.push(...ids);
        log(`  Pagina ${pageNum}: ${ids.length} ID → totale ${allIds.length}`);

        // Salva checkpoint ogni 5 pagine
        if (pageNum % 5 === 0) {
            const idsFile = path.join(SCRATCH_DIR, `tributaria_ids_${anno}_partial.json`);
            fs.writeFileSync(idsFile, JSON.stringify([...new Set(allIds)], null, 2));
        }

        // Cerca bottone pagina successiva
        const hasNext = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a.page-link, .pagination a'));
            const next = links.find(a => {
                const txt = a.textContent.trim();
                const li = a.closest('li');
                return (txt === '>' || txt === '»' || txt.includes('uccessiv'))
                    && !li?.classList.contains('disabled');
            });
            if (next) { next.click(); return true; }
            return false;
        });

        if (!hasNext) {
            log(`  ✅ Fine paginazione dopo ${pageNum} pagine`);
            break;
        }

        // Aspetta nuova pagina
        const prevCount = allIds.length;
        try {
            await page.waitForFunction(
                (prevC) => document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0,
                { timeout: 15000 }, prevCount
            );
        } catch (e) { break; }
        await sleep(3000);
        pageNum++;

        if (pageNum > 100) { log('  ⚠️ Limite 100 pagine, stop.'); break; }
    }

    return [...new Set(allIds)];
}

// ── Click pulsante Ricerca ────────────────────────────────────────────────────
async function clickRicerca(page) {
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.trim() === 'Ricerca');
        if (btn) btn.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await sleep(500);

    const coords = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.trim() === 'Ricerca');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    if (coords && coords.y > 0 && coords.y < 1000) {
        await page.mouse.click(coords.x, coords.y);
    } else {
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent.trim() === 'Ricerca')?.click();
        });
    }
    log('  ✅ Click Ricerca');
    await sleep(1500);
}

// ── Scarica il provvedimento dalla pagina di dettaglio ───────────────────────
async function downloadProvvedimento(page, cdp, destPath) {
    return new Promise(async (resolve) => {
        let done = false;
        let downloadedFile = null;

        const onProgress = async (evt) => {
            if (evt.state === 'completed') {
                done = true;
                downloadedFile = evt.filename;
            }
        };
        cdp.on('Browser.downloadProgress', onProgress);

        try {
            // Strategia 1: click sul bottone "Scarica provvedimento"
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
                log('  ⚠️ Pulsante "Scarica provvedimento" non trovato');
                // Strategia 2: prova URL diretto
                const docId = destPath.split('prov_')[1].replace('.pdf', '');
                const directUrl = `${BASE_URL}/private/giurisprudenza/provvedimento/${docId}`;
                await page.goto(directUrl, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
            }

            // Aspetta download (max 30s)
            const t0 = Date.now();
            while (!done && Date.now() - t0 < 30000) {
                await sleep(400);
            }

            if (done && downloadedFile) {
                await sleep(500);
                // Il browser salva il file con nome automatico nella OUTPUT_DIR
                if (fs.existsSync(downloadedFile)) {
                    fs.renameSync(downloadedFile, destPath);
                    cdp.off('Browser.downloadProgress', onProgress);
                    resolve(true);
                    return;
                }
            }

            // Fallback: cerca il file più recente nella OUTPUT_DIR
            const recent = fs.readdirSync(OUTPUT_DIR)
                .filter(f => f.endsWith('.pdf') && !f.startsWith('prov_') && !f.startsWith('massima_'))
                .map(f => ({ f, t: fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs }))
                .sort((a, b) => b.t - a.t)[0];

            if (recent && Date.now() - recent.t < 10000) {
                const src = path.join(OUTPUT_DIR, recent.f);
                if (!recent.f.endsWith('.crdownload')) {
                    fs.renameSync(src, destPath);
                    cdp.off('Browser.downloadProgress', onProgress);
                    resolve(true);
                    return;
                }
            }

            cdp.off('Browser.downloadProgress', onProgress);
            resolve(false);

        } catch (e) {
            log(`  ❌ Eccezione download: ${e.message.substring(0, 60)}`);
            cdp.off('Browser.downloadProgress', onProgress);
            resolve(false);
        }
    });
}

// ── Human warmup ─────────────────────────────────────────────────────────────
async function humanWarmup(page) {
    log('Warmup (6s)...');
    for (let i = 0; i < 4; i++) {
        await page.mouse.move(300 + Math.random() * 600, 200 + Math.random() * 400, { steps: 4 });
        await sleep(700 + Math.random() * 500);
    }
    await page.evaluate(() => window.scrollBy(0, 80));
    await sleep(400);
    await page.evaluate(() => window.scrollBy(0, -80));
    log('✅ Warmup completato.\n');
}

main().catch(e => {
    log(`❌ ERRORE FATALE: ${e.message}`);
    process.exit(1);
});
