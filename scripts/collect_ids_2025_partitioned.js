/**
 * COLLETTORE ID TRIBUTARIE 2025 PARTIZIONATO (Mese per Mese)
 *
 * Questa strategia divide la ricerca dell'anno 2025 in 12 intervalli mensili.
 * Riduce drasticamente il carico sul server della Giustizia Tributaria, evitando l'errore 500
 * e garantendo un recupero fluido e Akamai-safe di tutti i ~782 provvedimenti massimati del 2025.
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

const MONTHS_2025 = [
    { name: 'Gennaio', start: '01/01/2025', end: '31/01/2025' },
    { name: 'Febbraio', start: '01/02/2025', end: '28/02/2025' },
    { name: 'Marzo', start: '01/03/2025', end: '31/03/2025' },
    { name: 'Aprile', start: '01/04/2025', end: '30/04/2025' },
    { name: 'Maggio', start: '01/05/2025', end: '31/05/2025' },
    { name: 'Giugno', start: '01/06/2025', end: '30/06/2025' },
    { name: 'Luglio', start: '01/07/2025', end: '31/07/2025' },
    { name: 'Agosto', start: '01/08/2025', end: '31/08/2025' },
    { name: 'Settembre', start: '01/09/2025', end: '30/09/2025' },
    { name: 'Ottobre', start: '01/10/2025', end: '31/10/2025' },
    { name: 'Novembre', start: '01/11/2025', end: '30/11/2025' },
    { name: 'Dicembre', start: '01/12/2025', end: '31/12/2025' }
];

async function main() {
    log('🚀 Avvio Collettore ID 2025 Partizionato (Mese per Mese)...');

    const browser = await puppeteer.launch({
        headless: false, // Necessario per bypassare Akamai
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,950',
        ]
    });

    const allIds = new Set();
    // Se esiste già il file, carichiamo gli ID per non perderli
    if (fs.existsSync(OUT_FILE)) {
        try {
            const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
            if (Array.isArray(existing)) {
                existing.forEach(id => allIds.add(id));
                log(`📋 Caricati ${allIds.size} ID esistenti da checkpoint.`);
            }
        } catch (_) {}
    }

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

        // Accetta cookies
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent.includes('Accetta') || b.textContent.includes('accetta'));
            if (btn) btn.click();
        }).catch(() => {});
        await sleep(1000);

        // Loop dei mesi
        for (const month of MONTHS_2025) {
            log(`\n📅 Elaborazione mese: ${month.name} (Range: ${month.start} - ${month.end})`);
            
            let success = false;
            let attempts = 0;
            const maxAttempts = 3;

            while (!success && attempts < maxAttempts) {
                attempts++;
                log(`Tentativo ${attempts}/${maxAttempts} per il mese di ${month.name}...`);
                
                try {
                    // Se non è il primo tentativo, ricarichiamo la pagina di ricerca per resettare
                    if (attempts > 1 || month !== MONTHS_2025[0]) {
                        await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2', timeout: 60000 });
                        await sleep(2000);
                    }

                    // Selezioniamo prima l'anno
                    await page.waitForSelector('select[id="Form.ControlInput2"]', { timeout: 15000 });
                    await page.select('select[id="Form.ControlInput2"]', '2025');
                    await sleep(500);

                    // Dispatciamo gli eventi
                    await page.evaluate(() => {
                        const select = document.querySelector('select[id="Form.ControlInput2"]');
                        if (select) {
                            select.dispatchEvent(new Event('input', { bubbles: true }));
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                    await sleep(500);

                    // Ricerca provvedimenti massimati
                    const isChecked = await page.$eval('input[id="Form.ControlInput5"]', el => el.checked).catch(() => false);
                    if (!isChecked) {
                        await page.click('input[id="Form.ControlInput5"]');
                        await sleep(500);
                    }
                    await page.evaluate(() => {
                        const cb = document.querySelector('input[id="Form.ControlInput5"]');
                        if (cb) {
                            cb.dispatchEvent(new Event('input', { bubbles: true }));
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                    await sleep(500);

                    // Inserimento data inizio
                    await page.evaluate((val) => {
                        const input = document.querySelector('input[id="Form.ControlInput3"]');
                        if (input) {
                            input.value = val;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }, month.start);
                    await sleep(300);

                    // Inserimento data fine
                    await page.evaluate((val) => {
                        const input = document.querySelector('input[id="Form.ControlInput4"]');
                        if (input) {
                            input.value = val;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }, month.end);
                    await sleep(500);

                    // Clicchiamo ricerca
                    log('Invio Ricerca...');
                    await page.evaluate(() => {
                        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Ricerca');
                        if (btn) btn.click();
                    });
                    await sleep(3000);

                    // Attesa dei risultati
                    log('Attesa risultati...');
                    await page.waitForFunction(() => {
                        const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
                        const err = document.body.innerText.includes('si è verificato un errore');
                        const noRes = document.body.innerText.includes('Nessun risultato');
                        return links.length > 0 || err || noRes;
                    }, { timeout: 30000 });

                    const errDetected = await page.evaluate(() => document.body.innerText.includes('si è verificato un errore'));
                    if (errDetected) {
                        log('⚠️ Errore 500 rilevato! Riprovo con una nuova ricarica...');
                        await sleep(5000);
                        continue;
                    }

                    const noRes = await page.evaluate(() => document.body.innerText.includes('Nessun risultato'));
                    if (noRes) {
                        log(`ℹ️ Nessun risultato per ${month.name}.`);
                        success = true;
                        break;
                    }

                    const totalText = await page.evaluate(() => {
                        const el = Array.from(document.querySelectorAll('p, div, span'))
                            .find(e => e.innerText.includes('risultati trovati') || e.innerText.includes('Controversie trovate') || e.innerText.match(/\d+\s*risultat/i));
                        return el ? el.innerText.trim() : 'N/D';
                    });
                    log(`📊 Info Risultati: "${totalText}"`);

                    // Paginazione del mese corrente
                    let pageNum = 1;
                    while (true) {
                        const ids = await page.evaluate(() => {
                            return Array.from(document.querySelectorAll('a[href^="/ricerca/dettaglio/"]'))
                                .map(a => a.getAttribute('href').split('/').pop())
                                .filter(id => id && id.includes('-'));
                        });

                        const prevSize = allIds.size;
                        ids.forEach(id => allIds.add(id));
                        const newlyAdded = allIds.size - prevSize;
                        log(`📄 Pagina ${pageNum} | Estratti ${ids.length} ID (${newlyAdded} nuovi) | Totale unici cumulati: ${allIds.size}`);

                        // Salva checkpoint immediato per salvaguardare i progressi
                        fs.writeFileSync(OUT_FILE, JSON.stringify(Array.from(allIds), null, 2));

                        // Cerca pulsante pagina successiva
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
                            log(`✅ Fine paginazione per ${month.name}.`);
                            break;
                        }

                        // Attesa caricamento nuova pagina
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
                        await sleep(2500); // Cortesia Akamai rate limiting
                    }

                    success = true;

                } catch (e) {
                    log(`⚠️ Eccezione durante l'elaborazione del mese ${month.name}: ${e.message}`);
                    await sleep(5000);
                }
            }

            if (!success) {
                log(`❌ Impossibile completare l'estrazione per ${month.name} dopo ${maxAttempts} tentativi.`);
            }

            await sleep(2000); // Cortesia tra i mesi
        }

        // Salvataggio finale
        const finalArray = Array.from(allIds);
        fs.writeFileSync(OUT_FILE, JSON.stringify(finalArray, null, 2));
        log(`\n🎉 ESTRAZIONE DI GRUPPO COMPLETATA!`);
        log(`📁 ID totali unici estratti per il 2025: ${finalArray.length}`);
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
