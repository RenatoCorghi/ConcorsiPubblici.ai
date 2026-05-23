/**
 * COLLETTORE ID 2025 COMPLETI (Versione React-Safe)
 *
 * Svolge la sola raccolta di tutti i 782 ID dei provvedimenti massimati del 2025.
 * Utilizza Puppeteer headless:false con tecniche avanzate per forzare lo stato di React.
 *
 * Salva il risultato finale in: scratch/tributaria_ids_2025_completi.json
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

async function main() {
    console.log('🚀 Avvio Collettore ID 2025 Completi (React-Safe)...');

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

        console.log('Navigazione alla pagina di ricerca...');
        await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(3000);

        // Accetta cookie se presenti
        try {
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button'))
                    .find(b => b.textContent.includes('Accetta') || b.textContent.includes('consenso') || b.textContent.includes('chiudi'));
                if (btn) btn.click();
            });
            console.log('Cookie accettati.');
            await sleep(1000);
        } catch (e) {
            console.log('Nessun popup cookie rilevato.');
        }

        // Seleziona anno 2025 e checkbox massimati con la tecnica definitiva del Prototype Setter Override per React
        console.log('Impostazione anno 2025 e checkbox con Prototype Setter Override...');
        await page.waitForSelector('select[id="Form.ControlInput2"]', { timeout: 15000 });
        
        await page.evaluate(() => {
            // 1. Imposta Anno
            const select = document.querySelector('select[id="Form.ControlInput2"]');
            if (select) {
                const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
                if (descriptor && descriptor.set) {
                    descriptor.set.call(select, '2025');
                } else {
                    select.value = '2025';
                }
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
                select.focus();
                select.blur();
            }

            // 2. Imposta Checkbox Massimati
            const cb = document.querySelector('input[id="Form.ControlInput5"]');
            if (cb) {
                const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
                if (descriptor && descriptor.set) {
                    descriptor.set.call(cb, true);
                } else {
                    cb.checked = true;
                }
                cb.dispatchEvent(new Event('input', { bubbles: true }));
                cb.dispatchEvent(new Event('change', { bubbles: true }));
                cb.focus();
                cb.blur();
            }
        });
        await sleep(1500);

        // Verifica il valore selezionato per sicurezza
        const selectedVal = await page.$eval('select[id="Form.ControlInput2"]', el => el.value).catch(() => '?');
        const checkedVal = await page.$eval('input[id="Form.ControlInput5"]', el => el.checked).catch(() => false);
        console.log(`Valore select dopo override: ${selectedVal} | Checkbox checked: ${checkedVal}`);


        // Clicca Ricerca focalizzando il pulsante e premendo Enter (innesca il submit nativo del form)
        console.log('Esecuzione Ricerca via Focus + Enter...');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent.trim() === 'Ricerca');
            if (btn) {
                btn.scrollIntoView({ behavior: 'instant', block: 'center' });
                btn.focus();
            }
        });
        await sleep(800);
        await page.keyboard.press('Enter');
        await sleep(2000);

        // Aspetta i risultati (almeno che compaia la tabella)
        console.log('Attesa caricamento risultati...');
        await page.waitForFunction(() => {
            const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
            const hasError = document.body.innerText.includes('si è verificato un errore') || 
                             document.body.innerText.includes('selezionare un anno');
            return links.length > 0 || hasError;
        }, { timeout: 45000 });

        // Controlla se c'è un errore reale del server
        const errorText = await page.evaluate(() => {
            const txt = document.body.innerText;
            if (txt.includes('si è verificato un errore') && txt.toLowerCase().includes('riprova')) return 'Errore: Errore del server';
            return null;
        });

        if (errorText) {
            console.error(`❌ Ricerca fallita: ${errorText}`);
            // Facciamo screenshot per debug
            await page.screenshot({ path: path.join(SCRATCH_DIR, 'ricerca_fallita.png') });
            throw new Error(errorText);
        }

        const totalResultsText = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('p, div, span'))
                .find(e => e.innerText.includes('risultati trovati') || e.innerText.includes('Controversie trovate') || e.innerText.match(/\d+\s*risultat/i));
            return el ? el.innerText : 'Risultati presenti ma conteggio non rilevato';
        });
        console.log(`Risultati rilevati: "${totalResultsText.trim().replace(/\n/g, ' ')}"`);

        const allIds = new Set();
        let pageNum = 1;
        let running = true;

        while (running) {
            // Estrai gli ID dalla pagina corrente
            const ids = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a[href^="/ricerca/dettaglio/"]'))
                    .map(a => a.getAttribute('href').split('/').pop())
                    .filter(id => id && id.includes('-'));
            });

            ids.forEach(id => allIds.add(id));
            console.log(`Page ${pageNum} | Estratti ${ids.length} ID | Totale unici: ${allIds.size}`);

            // Salva salvataggio parziale ogni 5 pagine
            if (pageNum % 5 === 0) {
                fs.writeFileSync(OUT_FILE, JSON.stringify(Array.from(allIds), null, 2));
                console.log(`[Backup] Salvati ${allIds.size} ID finora.`);
            }

            // Clicca sul pulsante Successivo (">")
            const clickedNext = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a.page-link, .pagination a, li.page-item a'));
                const next = links.find(a => {
                    const txt = a.textContent.trim();
                    const li = a.closest('li');
                    // Il pulsante successiva ha il testo ">" o "»"
                    const isNextSymbol = txt === '>' || txt === '»' || txt.toLowerCase().includes('successiv');
                    return isNextSymbol && li && !li.classList.contains('disabled') && !a.classList.contains('disabled');
                });
                
                if (next) {
                    next.scrollIntoView({ behavior: 'instant', block: 'center' });
                    next.click();
                    return true;
                }
                return false;
            });

            if (!clickedNext) {
                console.log('Nessun pulsante "Successiva" abilitato trovato o fine della lista risultati.');
                break;
            }

            // Aspetta che i nuovi risultati vengano caricati confrontando il primo link o aspettando un loader
            const prevFirstId = ids[0];
            try {
                await page.waitForFunction((oldFirstId) => {
                    const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
                    if (links.length === 0) return false;
                    const newFirstId = links[0].getAttribute('href').split('/').pop();
                    return newFirstId !== oldFirstId;
                }, { timeout: 15000 }, prevFirstId);
            } catch (e) {
                console.log('⚠️ Avviso: Timeout attesa cambio pagina, procedo comunque...');
            }

            pageNum++;
            await sleep(2500); // Ritardo umano
        }

        // Salvataggio finale
        const finalArray = Array.from(allIds);
        fs.writeFileSync(OUT_FILE, JSON.stringify(finalArray, null, 2));
        console.log(`\n🎉 Completato con successo!`);
        console.log(`📁 ID totali salvati: ${finalArray.length} in ${OUT_FILE}`);

    } catch (e) {
        console.error('❌ Errore durante la raccolta:', e);
    } finally {
        await browser.close();
    }
}

main().catch(console.error);
