/**
 * COLLETTORE ULTIMATE ID TRIBUTARIE 2025 (V2)
 *
 * Unisce tutte le migliori strategie confermate:
 * - Puppeteer headless:false (bypassa Akamai)
 * - Warmup umano iniziale (10s)
 * - Input dei campi React via page.select ed eventi di sincronizzazione
 * - Paginazione robusta (fino a 80 pagine)
 * - Salvataggio checkpoint continui (ogni 5 pagine) in scratch/tributaria_ids_2025_completi.json
 */
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const OUT_FILE = path.join(SCRATCH_DIR, 'tributaria_ids_2025_completi.json');

fs.mkdirSync(SCRATCH_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// Simulazione comportamento umano per bypassare Akamai
async function humanWarmup(page) {
    log('Warmup umano in corso (10s)...');
    for (let i = 0; i < 6; i++) {
        const x = 300 + Math.random() * 600;
        const y = 200 + Math.random() * 400;
        await page.mouse.move(x, y, { steps: 5 });
        await sleep(800 + Math.random() * 600);
    }
    await page.evaluate(() => window.scrollBy(0, 150));
    await sleep(600);
    await page.evaluate(() => window.scrollBy(0, -150));
    await sleep(800);
    log('✅ Warmup completato.');
}

async function main() {
    log('🚀 Avvio Collettore Ultimate ID 2025 v2...');

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,950',
        ]
    });

    try {
        const [page] = await browser.pages();
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

        log('Navigazione alla pagina di ricerca tributaria...');
        await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(3000);

        // Gestione cookie
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent.includes('Accetta') || b.textContent.includes('accetta'));
            if (btn) btn.click();
        }).catch(() => {});
        await sleep(1000);

        // Esegui warmup Akamai
        await humanWarmup(page);

        // Seleziona Anno 2025
        log('Selezione anno 2025...');
        await page.waitForSelector('select[id="Form.ControlInput2"]', { timeout: 15000 });
        await page.click('select[id="Form.ControlInput2"]');
        await sleep(500);
        await page.select('select[id="Form.ControlInput2"]', '2025');
        await sleep(500);
        await page.evaluate(() => {
            const select = document.querySelector('select[id="Form.ControlInput2"]');
            if (select) {
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await sleep(1000);

        // Checkbox massimati
        log('Attivazione checkbox Massimati...');
        const isChecked = await page.$eval('input[id="Form.ControlInput5"]', el => el.checked).catch(() => false);
        if (!isChecked) {
            await page.click('input[id="Form.ControlInput5"]');
            await sleep(500);
        }
        log(`Checkbox massimati: ${await page.$eval('input[id="Form.ControlInput5"]', el => el.checked)}`);

        // Click Ricerca (usiamo coordinata o invio su focus)
        log('Invio Ricerca...');
        const btnCoords = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Ricerca');
            if (!btn) return null;
            btn.scrollIntoView({ behavior: 'instant', block: 'center' });
            const r = btn.getBoundingClientRect();
            return { x: r.x + r.width/2, y: r.y + r.height/2 };
        });

        if (btnCoords && btnCoords.y > 0 && btnCoords.y < 1000) {
            await page.mouse.click(btnCoords.x, btnCoords.y);
        } else {
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Ricerca');
                if (btn) btn.click();
            });
        }
        await sleep(3000);

        // Aspetta i risultati
        log('Attesa risultati...');
        let hasResults = false;
        try {
            await page.waitForFunction(() => {
                const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
                const err = document.body.innerText.includes('si è verificato un errore');
                const noRes = document.body.innerText.includes('Nessun risultato');
                return links.length > 0 || err || noRes;
            }, { timeout: 30000 });
            
            const errDetected = await page.evaluate(() => document.body.innerText.includes('si è verificato un errore'));
            if (errDetected) {
                log('⚠️ Errore 500 rilevato! Faccio un secondo tentativo di click Ricerca...');
                await sleep(3000);
                if (btnCoords) {
                    await page.mouse.click(btnCoords.x, btnCoords.y);
                } else {
                    await page.evaluate(() => {
                        Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Ricerca')?.click();
                    });
                }
                await page.waitForFunction(() => {
                    return document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0;
                }, { timeout: 20000 });
            }
            hasResults = true;
        } catch (e) {
            log(`❌ Timeout attesa risultati o errore non gestito: ${e.message}`);
            await page.screenshot({ path: path.join(SCRATCH_DIR, 'v2_timeout.png') });
            await browser.close();
            process.exit(1);
        }

        if (!hasResults) {
            log('❌ Nessun risultato trovato o ricerca fallita.');
            await browser.close();
            return;
        }

        const totalText = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('p, div, span'))
                .find(e => e.innerText.includes('risultati trovati') || e.innerText.includes('Controversie trovate') || e.innerText.match(/\d+\s*risultat/i));
            return el ? el.innerText.trim() : 'N/D';
        });
        log(`📊 Info Risultati: "${totalText}"`);

        // ── Paginazione e Raccolta ────────────────────────────────────────────
        const allIds = new Set();
        let pageNum = 1;

        while (true) {
            const ids = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href^="/ricerca/dettaglio/"]'))
                    .map(a => a.getAttribute('href').split('/').pop())
                    .filter(id => id && id.includes('-'));
            });

            ids.forEach(id => allIds.add(id));
            log(`📄 Pagina ${pageNum} | Estratti ${ids.length} ID | Totale unici: ${allIds.size}`);

            // Salva checkpoint ogni 5 pagine
            if (pageNum % 5 === 0) {
                fs.writeFileSync(OUT_FILE, JSON.stringify(Array.from(allIds), null, 2));
                log(`💾 Checkpoint salvato: ${allIds.size} ID su disco.`);
            }

            // Vai alla pagina successiva
            const hasNext = await page.evaluate(() => {
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
                log('✅ Fine paginazione. Nessun altro pulsante "Successiva" abilitato.');
                break;
            }

            // Aspetta il caricamento della nuova pagina
            const oldFirstId = ids[0];
            try {
                await page.waitForFunction((prevId) => {
                    const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
                    if (links.length === 0) return false;
                    return links[0].getAttribute('href').split('/').pop() !== prevId;
                }, { timeout: 15000 }, oldFirstId);
            } catch (e) {
                log('⚠️ Avvertimento: Timeout attesa transizione pagina, continuo...');
            }

            pageNum++;
            await sleep(3000); // Pausa per Akamai rate limiting
            
            if (pageNum > 100) {
                log('⚠️ Raggiunto limite di sicurezza 100 pagine, stop paginazione.');
                break;
            }
        }

        // Salvataggio finale
        const finalArray = Array.from(allIds);
        fs.writeFileSync(OUT_FILE, JSON.stringify(finalArray, null, 2));
        log(`\n🎉 ESTRAZIONE COMPLETATA CON SUCCESSO!`);
        log(`📁 ID totali estratti per il 2025: ${finalArray.length}`);
        log(`💾 Salvati in: ${OUT_FILE}`);

    } catch (e) {
        log(`❌ Errore fatale nello script: ${e.message}`);
        console.error(e);
    } finally {
        await browser.close();
        log('🏁 Browser chiuso.');
    }
}

main().catch(console.error);
