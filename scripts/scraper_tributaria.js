/**
 * SCRAPER TRIBUTARIA — Single Browser Strategy
 * 
 * Un unico browser headless:false che:
 * 1. Naviga al portale e passa Akamai
 * 2. Fa la ricerca e raccoglie gli ID
 * 3. Per ciascun ID, naviga alla pagina di dettaglio
 * 4. Trova l'URL del PDF e lo scarica tramite CDP
 * 
 * NON chiude mai il browser tra le fasi: la sessione Akamai rimane valida.
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const TARGET_YEAR = process.argv[2] || '2024';
const ONLY_MASSIMATI = true; // Vogliamo TUTTE le sentenze, non solo i massimati
const DOWNLOAD_MASSIMA = true;
const DOWNLOAD_PROVVEDIMENTO = true;

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'tributario_raw_pdfs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
    log('🚀 Scraper Corti Giustizia Tributaria (Single Browser)');
    log(`   Anno: ${TARGET_YEAR} | Solo Massimati: ${ONLY_MASSIMATI}`);
    log(`   Output: ${OUTPUT_DIR}\n`);

    const browser = await puppeteer.launch({
        headless: false,  // DEVE essere false per bypassare Akamai
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
        ]
    });

    // Usa la prima pagina del browser
    const [page] = await browser.pages();
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Configura CDP download behavior nella stessa sessione
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: OUTPUT_DIR,
        eventsEnabled: true,
    });

    // ── STEP 1: Apri la pagina di ricerca ──
    log(`Navigazione su ${BASE_URL}/ricerca ...`);
    await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'networkidle2', timeout: 60000 });

    const title = await page.title();
    log(`Titolo: "${title}"`);
    if (title.toLowerCase().includes('denied')) {
        log('⛔ Bloccato! Risolvi manualmente e premi INVIO...');
        await new Promise(r => process.stdin.once('data', r));
    }

    await page.waitForSelector('select[id="Form.ControlInput2"]', { timeout: 30000 });
    log('✅ SPA idratata.');

    // Accetta cookie
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Accetta'));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // ⏳ Attesa umana — Akamai analizza il comportamento per i primi secondi
    log('Simulazione comportamento umano (8s di attesa + movimenti mouse)...');
    // Simula movimenti mouse casuali mentre si "legge" la pagina
    for (let i = 0; i < 6; i++) {
        const x = 200 + Math.random() * 800;
        const y = 200 + Math.random() * 400;
        await page.mouse.move(x, y, { steps: 3 });
        await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
    }
    // Scrolla leggermente la pagina come farebbe un utente
    await page.evaluate(() => window.scrollBy(0, 80));
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => window.scrollBy(0, -80));
    await new Promise(r => setTimeout(r, 400));
    log('✅ Simulazione completata. Inizio compilazione form...');

    // ── STEP 2: Imposta filtri tramite interazione tastiera (massima compatibilità React) ──
    
    // Seleziona Anno con keyboard: focus + frecce fino all'anno target
    log('Selezione Anno 2024 con keyboard...');
    await page.focus('select[id="Form.ControlInput2"]');
    await new Promise(r => setTimeout(r, 300));
    
    // Leggi l'anno corrente e l'elenco delle opzioni
    const yearState = await page.evaluate(() => {
        const sel = document.querySelector('select[id="Form.ControlInput2"]');
        if (!sel) return null;
        const options = Array.from(sel.options).map((o, i) => ({ value: o.value, index: i }));
        const currentIdx = sel.selectedIndex;
        return { options, currentIdx, current: sel.value };
    });
    log(`Anno attuale: ${yearState?.current}, opzioni: ${JSON.stringify(yearState?.options)}`);
    
    // Trova l'indice dell'anno target
    const targetOpt = yearState?.options?.find(o => o.value === TARGET_YEAR);
    if (targetOpt) {
        const steps = targetOpt.index - (yearState?.currentIdx || 0);
        log(`Premendo ${Math.abs(steps) + 1} volte ArrowDown per l'overshoot trick...`);
        // Overshoot: vai UN passo oltre il target (trick per triggerare React onChange)
        for (let i = 0; i <= Math.abs(steps); i++) {
            await page.keyboard.press(steps > 0 ? 'ArrowDown' : 'ArrowUp');
            await new Promise(r => setTimeout(r, 80));
        }
        // Poi torna indietro di uno
        await page.keyboard.press(steps > 0 ? 'ArrowUp' : 'ArrowDown');
        await new Promise(r => setTimeout(r, 80));
    } else {
        // Fallback: page.select() con click simulato prima per attivare il focus
        await page.click('select[id="Form.ControlInput2"]');
        await page.select('select[id="Form.ControlInput2"]', TARGET_YEAR);
    }
    await new Promise(r => setTimeout(r, 500));
    
    // Verifica selezione anno
    const yearCheck = await page.$eval('select[id="Form.ControlInput2"]', el => el.value);
    log(`Anno selezionato: ${yearCheck}`);

    // Seleziona Massimati: click diretto
    if (ONLY_MASSIMATI) {
        log('Attivazione checkbox Massimati...');
        await page.click('input[id="Form.ControlInput5"]');
        await new Promise(r => setTimeout(r, 400));
        const isChecked = await page.$eval('input[id="Form.ControlInput5"]', el => el.checked).catch(() => false);
        log(`Massimati checked: ${isChecked}`);
        if (!isChecked) {
            await page.click('input[id="Form.ControlInput5"]');
            await new Promise(r => setTimeout(r, 400));
        }
    }

    // Controlla stato form
    const state = await page.evaluate(() => ({
        anno: document.querySelector('select[id="Form.ControlInput2"]')?.value,
        massimati: document.querySelector('input[id="Form.ControlInput5"]')?.checked,
    }));
    log(`Form: Anno=${state.anno} | Massimati=${state.massimati}`);

    // ── STEP 3: Intercetta le chiamate API e clicca Ricerca ──
    
    // Intercetta le richieste di rete per capire cosa succede dopo il click
    const capturedRequests = [];
    page.on('request', req => {
        if (req.resourceType() === 'fetch' || req.resourceType() === 'xhr') {
            capturedRequests.push({ url: req.url(), method: req.method(), postData: req.postData() });
            log(`  📤 Request: ${req.method()} ${req.url().substring(0, 100)}`);
        }
    });
    page.on('response', async res => {
        if (res.url().includes('giurisprudenza') || res.url().includes('api') || res.url().includes('ricerca')) {
            try {
                const body = await res.text();
                log(`  📥 Response: ${res.status()} ${res.url().substring(0, 80)} → ${body.substring(0, 150)}`);
            } catch (_) {}
        }
    });

    log('Chiusura sezione avanzata (se espansa) e scroll al pulsante...');
    // Clicca il header della sezione avanzata per collassarla
    await page.evaluate(() => {
        const advBtn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.includes('Ricerca avanzata'));
        if (advBtn) {
            const expanded = advBtn.getAttribute('aria-expanded') === 'true'
                || advBtn.parentElement?.querySelector('[class*="show"], [class*="open"], [style*="block"]') !== null;
            // Controlla se la sezione è espansa guardando il testo o lo stato
            const parentCollapse = advBtn.closest('[class*="accordion"]') || advBtn.parentElement;
            const isExpanded = document.querySelector('[id*="avanzata"], [class*="advanced"]')?.classList.contains('show')
                || advBtn.getAttribute('aria-expanded') === 'true';
            if (isExpanded) advBtn.click();
        }
    });
    await new Promise(r => setTimeout(r, 800));
    
    // Ora scrolla il pulsante Ricerca nel centro del viewport
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Ricerca');
        if (btn) btn.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await new Promise(r => setTimeout(r, 600));

    await page.screenshot({ path: path.join(__dirname, '..', 'scratch', 'before_click.png') });
    log('  📸 Screenshot pre-click salvato.');

    // Ora getBoundingClientRect() darà coordinate nel viewport
    const btnCoords = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Ricerca');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.x + r.width/2, y: r.y + r.height/2 };
    });
    log(`  Bottone nel viewport a: ${JSON.stringify(btnCoords)}`);
    
    // Aspetta per far stabilizzare la sessione Akamai prima della POST
    log('  Attendo 12s per stabilizzare sessione Akamai prima del click...');
    await new Promise(r => setTimeout(r, 12000));
    
    if (btnCoords && btnCoords.y > 0 && btnCoords.y < 1100) {
        await page.mouse.click(btnCoords.x, btnCoords.y);
        log(`  ✅ Mouse click a (${Math.round(btnCoords.x)}, ${Math.round(btnCoords.y)})`);
    } else {
        log(`  ❌ Bottone fuori range viewport (y=${btnCoords?.y})`);
        await page.screenshot({ path: path.join(__dirname, '..', 'scratch', 'results_check.png'), fullPage: true });
        await browser.close();
        return;
    }
    log('✅ Click Ricerca eseguito, attendo risultati...');

    // ── STEP 4: Aspetta i risultati o un errore del server ──
    try {
        await page.waitForFunction(() => {
            const hasResults = document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0;
            const hasServerError = document.body.innerText.includes('si è verificato un errore');
            const noResults = document.body.innerText.includes('Nessun risultato');
            const tooMany = document.body.innerText.includes('supera il valore massimo');
            return hasResults || hasServerError || noResults || tooMany;
        },
        { timeout: 60000 });
    } catch (e) {
        await page.screenshot({ path: path.join(__dirname, '..', 'scratch', 'results_check.png'), fullPage: true });
        log('❌ Timeout risultati. Screenshot salvato. Chiusura.');
        await browser.close();
        return;
    }

    // Controlla se c'è stato un errore server — riprova una volta
    const hasServerError = await page.evaluate(() =>
        document.body.innerText.includes('si è verificato un errore')
    );
    if (hasServerError) {
        log('⚠️ Errore server rilevato. Riprovo la ricerca tra 3 secondi...');
        await new Promise(r => setTimeout(r, 3000));
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent.trim() === 'Ricerca');
            if (btn) btn.click();
        });
        try {
            await page.waitForFunction(() =>
                document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0
                || document.body.innerText.includes('Nessun risultato'),
                { timeout: 45000 }
            );
            log('✅ Secondo tentativo riuscito!');
        } catch (e2) {
            await page.screenshot({ path: path.join(__dirname, '..', 'scratch', 'results_check.png'), fullPage: true });
            log('❌ Anche il secondo tentativo fallito. Chiusura.');
            await browser.close();
            return;
        }
    }

    await page.screenshot({ path: path.join(__dirname, '..', 'scratch', 'results_check.png') });

    // ── STEP 5: Estrai ID documenti da TUTTE le pagine ──
    let allIds = [];
    let currentPage = 1;
    const idsFile = path.join(__dirname, '..', 'scratch', `tributaria_ids_${TARGET_YEAR}.json`);

    while (true) {
        log(`Pagina risultati ${currentPage}...`);
        const ids = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href^="/ricerca/dettaglio/"]'));
            return [...new Set(links.map(l => {
                const parts = l.getAttribute('href').split('/');
                return parts[parts.length - 1];
            }))];
        });
        allIds.push(...ids);
        log(`  ${ids.length} ID trovati in questa pagina. Totale: ${allIds.length}`);
        
        // Salva backup continuo per evitare perdite in caso di crash
        fs.writeFileSync(idsFile, JSON.stringify(allIds, null, 2));

        // Prova a cliccare "pagina successiva"
        const hasNext = await page.evaluate(() => {
            const nextBtn = Array.from(document.querySelectorAll('ul.pagination li'))
                .find(li => !li.classList.contains('disabled') && 
                    (li.textContent.includes('>') || li.textContent.toLowerCase().includes('successiva')));
            if (nextBtn) {
                const a = nextBtn.querySelector('a');
                if (a) { a.click(); return true; }
            }
            return false;
        });

        if (!hasNext) break;
        
        await page.waitForFunction(() =>
            document.querySelectorAll('a[href^="/ricerca/dettaglio/"]').length > 0,
            { timeout: 15000 }
        ).catch(() => {});
        log('  Attesa 6s per caricamento pagina successiva...');
        await new Promise(r => setTimeout(r, 6000));
        currentPage++;
    }

    log(`\n📋 Totale ID unici: ${allIds.length}`);

    // ── STEP 6: Scarica ogni documento ──
    let downloaded = 0;
    let failed = 0;

    for (let i = 0; i < allIds.length; i++) {
        const docId = allIds[i];
        log(`\n─── [${i + 1}/${allIds.length}] ${docId} ───`);

        const detailUrl = `${BASE_URL}/ricerca/dettaglio/${docId}`;
        log(`  Navigazione a ${detailUrl}`);
        
        try {
            await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e) {
            log(`  ⚠️ Timeout navigazione. Attendo ancora 3 sec...`);
            await new Promise(r => setTimeout(r, 3000));
        }

        // Aspetta che la SPA carichi il contenuto della sentenza
        await page.waitForFunction(() =>
            document.body.innerText.trim().length > 500,
            { timeout: 10000 }
        ).catch(() => {});
        await new Promise(r => setTimeout(r, 1000));

        // Screenshot solo del primo documento
        if (i === 0) {
            await page.screenshot({ path: path.join(__dirname, '..', 'scratch', 'detail_check.png'), fullPage: true });
            log('  📸 Screenshot dettaglio salvato.');
        }

        // Trova i link di download
        const links = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('a, button'));
            return all.filter(el => {
                const title = (el.getAttribute('title') || '').toLowerCase();
                const href = (el.getAttribute('href') || '').toLowerCase();
                const txt = (el.textContent || '').toLowerCase().trim();
                return title.includes('pdf') || title.includes('scarica')
                    || href.includes('provvedimento') || href.includes('massima') || href.includes('.pdf')
                    || txt.includes('scarica');
            }).map(el => ({
                tag: el.tagName,
                href: el.getAttribute('href'),
                title: el.getAttribute('title'),
                text: el.textContent.trim().substring(0, 60)
            }));
        });
        log(`  🔗 Links download trovati: ${links.length} → ${JSON.stringify(links)}`);

        // ── Scarica provvedimento ──
        if (DOWNLOAD_PROVVEDIMENTO) {
            const outFile = path.join(OUTPUT_DIR, `prov_${docId}.pdf`);
            if (fs.existsSync(outFile)) {
                log(`  ⏭️ Provvedimento già presente.`);
                downloaded++;
            } else {
                const link = links.find(l => l.href?.includes('provvedimento') || l.title?.toLowerCase().includes('provvedimento'));
                const url = link?.href
                    ? (link.href.startsWith('http') ? link.href : `${BASE_URL}${link.href}`)
                    : `${BASE_URL}/private/giurisprudenza/provvedimento/${docId}`;

                log(`  ⬇️  Provvedimento: ${url}`);
                const ok = await downloadPDF(page, cdp, url, outFile);
                if (ok) { downloaded++; log('  ✅ Provvedimento scaricato!'); }
                else { failed++; log('  ❌ Provvedimento fallito.'); }
            }
        }

        // ── Scarica massima ──
        if (DOWNLOAD_MASSIMA) {
            const outFile = path.join(OUTPUT_DIR, `massima_${docId}.pdf`);
            if (fs.existsSync(outFile)) {
                log(`  ⏭️ Massima già presente.`);
                downloaded++;
            } else {
                const link = links.find(l => l.href?.includes('massima') || l.title?.toLowerCase().includes('massima'));
                const url = link?.href
                    ? (link.href.startsWith('http') ? link.href : `${BASE_URL}${link.href}`)
                    : `${BASE_URL}/private/giurisprudenza/massima/${docId}`;

                log(`  ⬇️  Massima: ${url}`);
                const ok = await downloadPDF(page, cdp, url, outFile);
                if (ok) { downloaded++; log('  ✅ Massima scaricata!'); }
                else { failed++; log('  ❌ Massima fallita.'); }
            }
        }

        await new Promise(r => setTimeout(r, 1500)); // Cortesia anti-rate-limit
    }

    await browser.close();
    log(`\n🎉 COMPLETATO!`);
    log(`   ✅ Scaricati: ${downloaded}`);
    log(`   ❌ Falliti: ${failed}`);
    log(`   📁 Output: ${OUTPUT_DIR}`);
}

// ─── Helper: naviga all'URL nel browser e aspetta il download CDP ─────────────
async function downloadPDF(page, cdp, url, destPath) {
    return new Promise(async (resolve) => {
        let done = false;
        let dlPath = null;

        const onProgress = (evt) => {
            if (evt.state === 'completed') {
                done = true;
                dlPath = evt.filename;
                log(`    📥 CDP download completato: ${evt.filename}`);
            } else if (evt.state === 'inProgress') {
                log(`    📥 In progress: ${Math.round((evt.receivedBytes / evt.totalBytes) * 100) || '?'}%`);
            }
        };
        cdp.on('Browser.downloadProgress', onProgress);

        try {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 25000 }).catch(e => {
                log(`    ⚠️ goto error (normal per PDF): ${e.message.substring(0, 60)}`);
            });

            // Aspetta download (max 20 sec)
            const t0 = Date.now();
            while (!done && Date.now() - t0 < 20000) {
                await new Promise(r => setTimeout(r, 500));
            }

            if (done && dlPath && fs.existsSync(dlPath)) {
                try {
                    fs.renameSync(dlPath, destPath);
                    const size = fs.statSync(destPath).size;
                    log(`    📄 Salvato: ${path.basename(destPath)} (${Math.round(size / 1024)} KB)`);
                    resolve(true);
                } catch (renameErr) {
                    log(`    ⚠️ Rename fallito: ${renameErr.message}`);
                    resolve(false);
                }
            } else {
                // Il file potrebbe già essere stato scaricato nella cartella OUTPUT_DIR
                // (il browser sceglie il nome automaticamente)
                const recent = fs.readdirSync(OUTPUT_DIR)
                    .filter(f => f.endsWith('.pdf') || f.endsWith('.crdownload'))
                    .map(f => ({ f, t: fs.statSync(path.join(OUTPUT_DIR, f)).mtime.getTime() }))
                    .sort((a, b) => b.t - a.t)[0];
                
                if (recent && Date.now() - recent.t < 5000) {
                    const src = path.join(OUTPUT_DIR, recent.f);
                    if (src !== destPath && !recent.f.endsWith('.crdownload')) {
                        fs.renameSync(src, destPath);
                        log(`    📄 File rilevato: ${path.basename(destPath)}`);
                        resolve(true);
                        return;
                    }
                }

                log(`    ❌ Download non rilevato per: ${url}`);
                resolve(false);
            }
        } catch (e) {
            log(`    ❌ Eccezione: ${e.message}`);
            resolve(false);
        } finally {
            cdp.off('Browser.downloadProgress', onProgress);
        }
    });
}

main().catch(console.error);
