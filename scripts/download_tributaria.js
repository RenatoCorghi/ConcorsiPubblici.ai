/**
 * DOWNLOADER TRIBUTARIA — Phase 2 Only
 * 
 * Legge da: scratch/session.json
 * - cookies: i cookie della sessione acquisita dal browser
 * - docIds: gli ID dei documenti da scaricare
 * 
 * Usa Puppeteer con headless:false per navigare alle pagine di dettaglio
 * nella stessa sessione autenticata e scaricare i PDF.
 * 
 * Esegui DOPO aver acquisito la sessione tramite browser_subagent.
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const SESSION_FILE = path.join(__dirname, '..', 'scratch', 'session.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'tributario_raw_pdfs');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
    log('📦 Downloader Tributaria — Phase 2');
    
    if (!fs.existsSync(SESSION_FILE)) {
        log(`❌ File sessione non trovato: ${SESSION_FILE}`);
        log('Esegui prima il browser_subagent per acquisire la sessione.');
        return;
    }
    
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const { cookies, docIds } = session;
    
    log(`🍪 Cookie: ${cookies.map(c => c.name).join(', ')}`);
    log(`📋 Documenti da scaricare: ${docIds.length}`);
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
        ]
    });
    
    const [page] = await browser.pages();
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setCookie(...cookies);
    
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: OUTPUT_DIR,
        eventsEnabled: true,
    });
    
    // Prima naviga sulla homepage con i cookie per stabilire la sessione
    log(`Navigazione sulla home per stabilire la sessione...`);
    try {
        await page.goto(`${BASE_URL}/ricerca`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        const title = await page.title();
        log(`  Titolo: "${title}"`);
        if (title.toLowerCase().includes('denied') || title.toLowerCase().includes('error')) {
            log('  ⚠️ Sessione non valida — cookie scaduti. Aggiorna session.json con cookie freschi.');
            await browser.close();
            return;
        }
    } catch (e) {
        log(`  ⚠️ Navigazione home fallita (${e.message.substring(0, 60)}). Provo il primo documento direttamente...`);
    }
    await new Promise(r => setTimeout(r, 2000));
    
    let downloaded = 0;
    let failed = 0;
    
    for (let i = 0; i < docIds.length; i++) {
        const docId = docIds[i];
        log(`\n─── [${i + 1}/${docIds.length}] ${docId} ───`);
        
        // Naviga alla pagina di dettaglio
        const detailUrl = `${BASE_URL}/ricerca/dettaglio/${docId}`;
        log(`  Navigazione a ${detailUrl}`);
        
        try {
            await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e) {
            log(`  ⚠️ Navigazione lenta, continuo...`);
        }
        
        await page.waitForFunction(() =>
            document.body.innerText.trim().length > 500,
            { timeout: 10000 }
        ).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));
        
        if (i === 0) {
            await page.screenshot({ path: path.join(__dirname, '..', 'scratch', 'detail_check.png'), fullPage: true });
            log('  📸 Screenshot dettaglio salvato');
        }
        
        // Trova i link di download
        const links = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('a, button'));
            return all.filter(el => {
                const href = (el.getAttribute('href') || '').toLowerCase();
                const title = (el.getAttribute('title') || '').toLowerCase();
                const txt = (el.textContent || '').toLowerCase().trim();
                return href.includes('provvedimento') || href.includes('massima') || href.includes('.pdf')
                    || title.includes('scarica') || txt.includes('scarica provvedimento') || txt.includes('scarica massima');
            }).map(el => ({
                href: el.getAttribute('href'),
                title: el.getAttribute('title'),
                text: el.textContent.trim().substring(0, 60)
            }));
        });
        log(`  🔗 Links: ${JSON.stringify(links)}`);
        
        // Scarica provvedimento — clicca il pulsante nella pagina
        {
            const outFile = path.join(OUTPUT_DIR, `prov_${docId}.pdf`);
            if (fs.existsSync(outFile)) {
                log(`  ⏭️ Provvedimento già presente`);
                downloaded++;
            } else {
                log(`  ⬇️ Click "Scarica provvedimento"...`);
                const ok = await clickAndDownload(page, cdp, 'Scarica provvedimento', outFile, OUTPUT_DIR);
                if (ok) { downloaded++; log('  ✅ Provvedimento scaricato!'); }
                else { failed++; log('  ❌ Provvedimento fallito.'); }
            }
        }
        
        // Scarica massima — clicca il pulsante nella pagina
        {
            const outFile = path.join(OUTPUT_DIR, `massima_${docId}.pdf`);
            if (fs.existsSync(outFile)) {
                log(`  ⏭️ Massima già presente`);
                downloaded++;
            } else {
                log(`  ⬇️ Click "Scarica Massima"...`);
                const ok = await clickAndDownload(page, cdp, 'Scarica Massima', outFile, OUTPUT_DIR);
                if (ok) { downloaded++; log('  ✅ Massima scaricata!'); }
                else { failed++; log('  ❌ Massima fallita.'); }
            }
        }
        
        await new Promise(r => setTimeout(r, 1500));
    }
    
    await browser.close();
    log(`\n🎉 COMPLETATO!`);
    log(`   ✅ Scaricati: ${downloaded}`);
    log(`   ❌ Falliti: ${failed}`);
    log(`   📁 Output: ${OUTPUT_DIR}`);
}

async function clickAndDownload(page, cdp, buttonText, destPath, outputDir) {
    return new Promise(async (resolve) => {
        let done = false;
        let downloadFilename = null;
        
        const onProgress = (evt) => {
            if (evt.state === 'inProgress') {
                downloadFilename = evt.filename;
            }
            if (evt.state === 'completed') {
                done = true;
                log(`    📥 Download CDP completato: ${evt.filename}`);
            }
        };
        cdp.on('Browser.downloadProgress', onProgress);
        
        try {
            // Clicca il pulsante con il testo specificato
            const clicked = await page.evaluate((text) => {
                const btn = Array.from(document.querySelectorAll('button, a'))
                    .find(el => el.textContent.trim().toLowerCase().includes(text.toLowerCase()));
                if (btn) { btn.click(); return true; }
                return false;
            }, buttonText);
            
            if (!clicked) {
                log(`    ❌ Pulsante "${buttonText}" non trovato!`);
                cdp.off('Browser.downloadProgress', onProgress);
                resolve(false);
                return;
            }
            log(`    ✅ Click su "${buttonText}" eseguito`);
            
            // Aspetta il download con timeout
            const t0 = Date.now();
            while (!done && Date.now() - t0 < 25000) {
                await new Promise(r => setTimeout(r, 500));
            }
            
            if (done) {
                // Il file è stato scaricato nella OUTPUT_DIR con nome assegnato dal browser
                await new Promise(r => setTimeout(r, 1000)); // Aspetta che il file sia scritto
                
                // Cerca il file più recente nella directory (scaricato nel momento corrente)
                const allFiles = fs.readdirSync(outputDir)
                    .filter(f => f.endsWith('.pdf') && !f.startsWith('prov_') && !f.startsWith('massima_'))
                    .map(f => ({ f, t: fs.statSync(path.join(outputDir, f)).mtime.getTime() }))
                    .sort((a, b) => b.t - a.t);
                
                const recent = allFiles[0];
                if (recent && Date.now() - recent.t < 15000) {
                    const src = path.join(outputDir, recent.f);
                    fs.renameSync(src, destPath);
                    const size = fs.statSync(destPath).size;
                    log(`    📄 Salvato: ${path.basename(destPath)} (${Math.round(size / 1024)} KB)`);
                    resolve(true);
                    return;
                }
            }
            
            log(`    ❌ Nessun download rilevato.`);
            resolve(false);
        } catch (e) {
            log(`    ❌ Eccezione: ${e.message}`);
            resolve(false);
        } finally {
            cdp.off('Browser.downloadProgress', onProgress);
        }
    });
}

async function downloadPDF(page, cdp, url, destPath, outputDir) {

    return new Promise(async (resolve) => {
        let done = false;
        
        const onProgress = (evt) => {
            if (evt.state === 'completed') {
                done = true;
                log(`    📥 Download completato (CDP): ${evt.filename}`);
            }
        };
        cdp.on('Browser.downloadProgress', onProgress);
        
        try {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 25000 }).catch(e => {
                log(`    ⚠️ goto error (normale per PDF): ${e.message.substring(0, 60)}`);
            });
            
            const t0 = Date.now();
            while (!done && Date.now() - t0 < 20000) {
                await new Promise(r => setTimeout(r, 500));
            }
            
            if (done) {
                // Cerca il file più recente nella directory
                const recent = fs.readdirSync(outputDir)
                    .filter(f => f.endsWith('.pdf') && !f.startsWith('prov_') && !f.startsWith('massima_'))
                    .map(f => ({ f, t: fs.statSync(path.join(outputDir, f)).mtime.getTime() }))
                    .sort((a, b) => b.t - a.t)[0];
                
                if (recent && Date.now() - recent.t < 10000) {
                    const src = path.join(outputDir, recent.f);
                    fs.renameSync(src, destPath);
                    const size = fs.statSync(destPath).size;
                    log(`    📄 Salvato: ${path.basename(destPath)} (${Math.round(size / 1024)} KB)`);
                    resolve(true);
                    return;
                }
            }
            
            log(`    ❌ Nessun download rilevato.`);
            resolve(false);
        } catch (e) {
            log(`    ❌ Eccezione: ${e.message}`);
            resolve(false);
        } finally {
            cdp.off('Browser.downloadProgress', onProgress);
        }
    });
}

main().catch(console.error);
