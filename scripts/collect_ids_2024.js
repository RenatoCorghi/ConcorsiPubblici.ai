/**
 * RACCOLTA ID PROVVEDIMENTI MASSIMATI 2024 (CGT) - DEFINITIVO
 * 
 * Si collega alla sessione Chrome attiva (porta 9222),
 * suddivide l'anno 2024 in 24 intervalli quindicinali per prevenire errori 500,
 * utilizza il React Prototype Setter Override per impostare i campi di ricerca,
 * esegue le query ed estrae tutti gli ID accumulandoli ed deduplicandoli.
 * Salva i risultati in scratch/tributaria_ids_2024.json.
 * 
 * Uso:
 *   node scripts/collect_ids_2024.js
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const OUT_FILE = path.join(__dirname, '..', 'scratch', 'tributaria_ids_2024.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

const RANGES_2024 = [
    { name: 'Gen 1-15', start: '2024-01-01', end: '2024-01-15' },
    { name: 'Gen 16-31', start: '2024-01-16', end: '2024-01-31' },
    { name: 'Feb 1-15', start: '2024-02-01', end: '2024-02-15' },
    { name: 'Feb 16-29', start: '2024-02-16', end: '2024-02-29' }, // Bisestile
    { name: 'Mar 1-15', start: '2024-03-01', end: '2024-03-15' },
    { name: 'Mar 16-31', start: '2024-03-16', end: '2024-03-31' },
    { name: 'Apr 1-15', start: '2024-04-01', end: '2024-04-15' },
    { name: 'Apr 16-30', start: '2024-04-16', end: '2024-04-30' },
    { name: 'Mag 1-15', start: '2024-05-01', end: '2024-05-15' },
    { name: 'Mag 16-31', start: '2024-05-16', end: '2024-05-31' },
    { name: 'Giu 1-15', start: '2024-06-01', end: '2024-06-15' },
    { name: 'Giu 16-30', start: '2024-06-16', end: '2024-06-30' },
    { name: 'Lug 1-15', start: '2024-07-01', end: '2024-07-15' },
    { name: 'Lug 16-31', start: '2024-07-16', end: '2024-07-31' },
    { name: 'Ago 1-15', start: '2024-08-01', end: '2024-08-15' },
    { name: 'Ago 16-31', start: '2024-08-16', end: '2024-08-31' },
    { name: 'Set 1-15', start: '2024-09-01', end: '2024-09-15' },
    { name: 'Set 16-30', start: '2024-09-16', end: '2024-09-30' },
    { name: 'Ott 1-15', start: '2024-10-01', end: '2024-10-15' },
    { name: 'Ott 16-31', start: '2024-10-16', end: '2024-10-31' },
    { name: 'Nov 1-15', start: '2024-11-01', end: '2024-11-15' },
    { name: 'Nov 16-30', start: '2024-11-16', end: '2024-11-30' },
    { name: 'Dic 1-15', start: '2024-12-01', end: '2024-12-15' },
    { name: 'Dic 16-31', start: '2024-12-16', end: '2024-12-31' }
];

async function humanWarmup(page) {
    for (let i = 0; i < 3; i++) {
        const x = 200 + Math.random() * 600;
        const y = 150 + Math.random() * 400;
        await page.mouse.move(x, y, { steps: 4 }).catch(() => {});
        await sleep(300 + Math.random() * 300);
    }
}

async function main() {
    log('🚀 Avvio Collettore ID Massimati CGT 2024...');

    const allIds = new Set();
    
    // Carica ID esistenti se presenti
    if (fs.existsSync(OUT_FILE)) {
        try {
            const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
            if (Array.isArray(existing)) {
                existing.forEach(id => allIds.add(id));
                log(`📋 Caricati ${allIds.size} ID preesistenti dal file.`);
            }
        } catch (_) {}
    }

    let browser;
    try {
        browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    } catch (e) {
        log('❌ Errore di connessione a Chrome sulla porta 9222. Assicurati che sia aperto.');
        return;
    }

    // Usiamo una pagina pulita, creandola nella sessione attiva
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    try {
        log('Navigazione alla pagina di ricerca tributaria...');
        await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2', timeout: 45000 });
        await sleep(2500);

        // Chiudi eventuali modali o accetta cookie
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent.includes('Accetta') || b.textContent.includes('accetta'));
            if (btn) btn.click();
        }).catch(() => {});
        await sleep(1000);

        await humanWarmup(page);

        for (const range of RANGES_2024) {
            log(`\n📅 Range: ${range.name} (${range.start} - ${range.end})`);
            
            let success = false;
            let attempt = 0;
            const maxAttempts = 3;

            while (!success && attempt < maxAttempts) {
                attempt++;
                log(`Tentativo ${attempt}/${maxAttempts} per il range ${range.name}...`);

                try {
                    // Resetta caricando di nuovo il form
                    await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2', timeout: 45000 });
                    await sleep(2000);

                    // Applica override per compilare lo stato React
                    const fillSuccess = await page.evaluate((startVal, endVal) => {
                        const setReactValue = (selector, val) => {
                            const el = document.querySelector(selector);
                            if (!el) return false;
                            const prototype = Object.getPrototypeOf(el);
                            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                            if (setter) {
                                setter.call(el, val);
                            } else {
                                el.value = val;
                            }
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            return true;
                        };

                        const setReactCheckbox = (selector, checked) => {
                            const el = document.querySelector(selector);
                            if (!el) return false;
                            const prototype = Object.getPrototypeOf(el);
                            const setter = Object.getOwnPropertyDescriptor(prototype, 'checked')?.set;
                            if (setter) {
                                setter.call(el, checked);
                            } else {
                                el.checked = checked;
                            }
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            return true;
                        };

                        // 1. Anno (Lasciamo vuoto per cercare solo per range date e prevenire errore 500)
                        const s1 = setReactValue('select[id="Form.ControlInput2"]', '');
                        // 2. Data inizio range
                        const s2 = setReactValue('input[id="Form.ControlInput3"]', startVal);
                        // 3. Data fine range
                        const s3 = setReactValue('input[id="Form.ControlInput4"]', endVal);
                        // 4. Checkbox massimati
                        const s4 = setReactCheckbox('input[id="Form.ControlInput5"]', true);

                        return s1 && s2 && s3 && s4;
                    }, range.start, range.end);

                    if (!fillSuccess) {
                        log('❌ Compilazione form fallita. Riprovo...');
                        continue;
                    }

                    await sleep(1000);

                    // Click Ricerca focalizzando e premendo Invio per React
                    await page.evaluate(() => {
                        const btn = Array.from(document.querySelectorAll('button'))
                            .find(b => b.textContent.trim() === 'Ricerca');
                        if (btn) {
                            btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                            btn.focus();
                        }
                    });
                    await sleep(500);
                    await page.keyboard.press('Enter');

                    // Attesa risultati o errori
                    log('Attesa risposta dal server...');
                    await page.waitForFunction(() => {
                        const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
                        const err = document.body.innerText.includes('si è verificato un errore');
                        const noRes = document.body.innerText.includes('Nessun risultato');
                        return links.length > 0 || err || noRes;
                    }, { timeout: 35000 });

                    const errDetected = await page.evaluate(() => document.body.innerText.includes('si è verificato un errore'));
                    if (errDetected) {
                        log('⚠️ Rilevato errore 500 dal server. Riprovo in questo range...');
                        await sleep(5000);
                        continue;
                    }

                    const noRes = await page.evaluate(() => document.body.innerText.includes('Nessun risultato'));
                    if (noRes) {
                        log('ℹ️ Nessun risultato trovato in questo intervallo.');
                        success = true;
                        break;
                    }

                    const totalText = await page.evaluate(() => {
                        const el = Array.from(document.querySelectorAll('p, div, span'))
                            .find(e => e.innerText.includes('risultati trovati') || e.innerText.includes('Controversie trovate') || e.innerText.match(/\d+\s*risultat/i));
                        return el ? el.innerText.trim() : 'N/D';
                    });
                    log(`📊 Risultati: "${totalText}"`);

                    // Paginazione del range corrente
                    let pageNum = 1;
                    while (true) {
                        const ids = await page.evaluate(() => {
                            return Array.from(document.querySelectorAll('a[href^="/ricerca/dettaglio/"]'))
                                .map(a => a.getAttribute('href').split('/').pop())
                                .filter(id => id && id.includes('-'));
                        });

                        const prevSize = allIds.size;
                        ids.forEach(id => allIds.add(id));
                        const added = allIds.size - prevSize;
                        log(`  📄 Pagina ${pageNum} | Estratti ${ids.length} ID (${added} nuovi) | Totale unici cumulati: ${allIds.size}`);

                        // Scrittura immediata su disco (checkpoint)
                        fs.writeFileSync(OUT_FILE, JSON.stringify(Array.from(allIds), null, 2));

                        // Cerca bottone pagina successiva
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
                            log(`  ✅ Fine risultati per il range ${range.name}.`);
                            break;
                        }

                        // Aspetta caricamento nuova pagina
                        const oldFirstId = ids[0];
                        try {
                            await page.waitForFunction((prevId) => {
                                const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
                                if (links.length === 0) return false;
                                return links[0].getAttribute('href').split('/').pop() !== prevId;
                            }, { timeout: 15000 }, oldFirstId);
                        } catch (e) {
                            log('  ⚠️ Timeout attesa transizione pagina, continuo comunque...');
                        }

                        pageNum++;
                        await sleep(2500); // Ritardo cortesia
                    }

                    success = true;

                } catch (err) {
                    log(`❌ Eccezione nel range ${range.name}: ${err.message}`);
                    await sleep(4000);
                }
            }

            if (!success) {
                log(`❌ Fallito completamente il range ${range.name} dopo ${maxAttempts} tentativi.`);
            }

            await sleep(2000);
        }

        log(`\n🎉 ESTRAZIONE COMPLETATA CON SUCCESSO!`);
        log(`📁 ID totali 2024 salvati in scratch/tributaria_ids_2024.json: ${allIds.size}`);

    } catch (e) {
        log(`❌ Errore fatale: ${e.message}`);
    } finally {
        await page.close();
        browser.disconnect();
    }
}

main().catch(console.error);
