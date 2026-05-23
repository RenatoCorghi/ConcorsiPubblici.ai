/**
 * COLLETTORE ID TRIBUTARIE 2025 (V3 - NO HANG)
 *
 * Versione super-snella senza warmup mouse (evita blocchi Puppeteer in background)
 * ma con robusto click nativo e selezione campi per React.
 */
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const OUT_FILE = path.join(SCRATCH_DIR, 'tributaria_ids_2025.json');

fs.mkdirSync(SCRATCH_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
    log('🚀 Avvio Collettore ID 2025 v3 (No-Hang)...');

    const browser = await puppeteer.launch({
        headless: false, // DEVE essere false per bypassare Akamai su pagine successive
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

        async function executeSearchWithRetry(attempt = 1) {
            log(`Tentativo di ricerca #${attempt}...`);
            if (attempt > 1) {
                log('Ricarico la pagina per azzerare lo stato di errore...');
                await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2', timeout: 60000 });
                await sleep(3000);
            }

            // Seleziona Anno 2025
            log('Selezione anno 2025...');
            await page.waitForSelector('select[id="Form.ControlInput2"]', { timeout: 15000 });
            await page.select('select[id="Form.ControlInput2"]', '2025');
            await sleep(500);
            
            // Forza l'evento di input e change per far reagire React
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
            
            // Forza React sul checkbox
            await page.evaluate(() => {
                const cb = document.querySelector('input[id="Form.ControlInput5"]');
                if (cb) {
                    cb.dispatchEvent(new Event('input', { bubbles: true }));
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            await sleep(1000);

            log(`Checkbox massimati checked: ${await page.$eval('input[id="Form.ControlInput5"]', el => el.checked)}`);

            // Click Ricerca
            log('Invio Ricerca...');
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Ricerca');
                if (btn) btn.click();
            });
            await sleep(3000);

            // Aspetta i risultati
            log('Attesa risultati...');
            try {
                await page.waitForFunction(() => {
                    const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
                    const err = document.body.innerText.includes('si è verificato un errore');
                    const noRes = document.body.innerText.includes('Nessun risultato');
                    return links.length > 0 || err || noRes;
                }, { timeout: 30000 });
                
                const errDetected = await page.evaluate(() => document.body.innerText.includes('si è verificato un errore'));
                if (errDetected) {
                    if (attempt >= 5) {
                        throw new Error("Troppi errori 500 consecutivi.");
                    }
                    log('⚠️ Errore 500 rilevato! Riprovo con una nuova ricarica...');
                    await sleep(5000);
                    return await executeSearchWithRetry(attempt + 1);
                }
                
                const linksCount = await page.evaluate(() => document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length);
                if (linksCount === 0) {
                    log('ℹ️ Nessun risultato trovato.');
                    return false;
                }

                return true;
            } catch (e) {
                if (attempt >= 5) {
                    throw e;
                }
                log(`⚠️ Errore/Timeout durante la ricerca (${e.message}). Riprovo con una ricarica...`);
                await sleep(5000);
                return await executeSearchWithRetry(attempt + 1);
            }
        }

        const searchSuccess = await executeSearchWithRetry(1);
        if (!searchSuccess) {
            log('❌ Ricerca fallita o nessun risultato. Esco.');
            await browser.close();
            process.exit(1);
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
            await sleep(2500); // Pausa per Akamai rate limiting
            
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
