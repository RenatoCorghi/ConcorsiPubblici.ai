import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const OUT_FILE = path.join(SCRATCH_DIR, 'tributaria_ids_active_session.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
    log('🚀 Connessione al browser aperto (porta 9222)...');
    let browser;
    try {
        browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    } catch (e) {
        log('❌ Errore di connessione al browser. Assicurati che Chrome sia avviato con --remote-debugging-port=9222');
        return;
    }

    const pages = await browser.pages();
    let targetPage = null;

    for (const p of pages) {
        const url = p.url();
        if (url.includes('/ricerca')) {
            // Controlla se ha risultati
            const hasLinks = await p.evaluate(() => document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0).catch(() => false);
            if (hasLinks) {
                targetPage = p;
                break;
            }
        }
    }

    if (!targetPage) {
        log('❌ Non ho trovato nessuna scheda aperta con i risultati della ricerca (/ricerca con link ai dettagli).');
        browser.disconnect();
        return;
    }

    log(`✅ Trovata scheda con i risultati: ${targetPage.url()}`);
    await targetPage.bringToFront();

    let allIds = new Set();
    if (fs.existsSync(OUT_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
            saved.forEach(id => allIds.add(id));
            log(`📋 Caricati ${allIds.size} ID dal salvataggio precedente.`);
        } catch (e) {}
    }

    let pageNum = 1;
    log('Inizio estrazione e paginazione...');

    while (true) {
        // Estrai ID dalla pagina corrente
        const ids = await targetPage.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href^="/ricerca/dettaglio/"]'))
                .map(a => a.getAttribute('href').split('/').pop())
                .filter(id => id && id.includes('-'));
        });

        if (ids.length === 0) {
            log('⚠️ Nessun ID trovato in questa pagina. Provo ad aspettare...');
            await sleep(2000);
            continue; // Potrebbe non aver ancora caricato
        }

        let newIdsCount = 0;
        ids.forEach(id => {
            if (!allIds.has(id)) {
                allIds.add(id);
                newIdsCount++;
            }
        });

        log(`📄 Pagina ${pageNum} | Estratti ${ids.length} ID (${newIdsCount} nuovi) | Totale unici: ${allIds.size}`);

        // Salva checkpoint
        fs.writeFileSync(OUT_FILE, JSON.stringify(Array.from(allIds), null, 2));

        // Cerca bottone pagina successiva
        const hasNext = await targetPage.evaluate(() => {
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
            await targetPage.waitForFunction((prevId) => {
                const links = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]');
                if (links.length === 0) return false;
                return links[0].getAttribute('href').split('/').pop() !== prevId;
            }, { timeout: 15000 }, oldFirstId);
        } catch (e) {
            log('⚠️ Timeout attesa transizione pagina, ricarico IDs per sicurezza...');
        }

        pageNum++;
        await sleep(2000); // Pausa di rispetto
    }

    log(`\n🎉 ESTRAZIONE COMPLETATA! Totale ID unici raccolti: ${allIds.size}`);
    log(`💾 Salvati in: ${OUT_FILE}`);
    browser.disconnect();
}

main().catch(e => console.error(e));
