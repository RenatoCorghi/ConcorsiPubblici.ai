/**
 * SCRAPER GA — Ricerca Sentenze Mancanti via Puppeteer
 * 
 * Naviga la pagina di ricerca decisioni/pareri del portale GA
 * (https://www.giustizia-amministrativa.it/dcsnprr)
 * e scarica il testo delle sentenze mancanti.
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('./sentenze_admin_mancanti');
const DELAY_MS = 2500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log('\n🚀 Scraper GA — Decisioni e Pareri');
    console.log('═'.repeat(55) + '\n');

    const report = JSON.parse(fs.readFileSync('data/ga_crossref_report.json', 'utf8'));
    const allMissing = [
        ...report.cds.lista_mancanti.map(s => ({ ...s, corte_tipo: 'CdS', sede: '00' })),
        ...report.tar.lista_mancanti.map(s => ({ ...s, corte_tipo: 'TAR', sede: '' }))
    ].sort((a, b) => b.citazioni - a.citazioni);

    console.log(`🎯 Sentenze da cercare: ${allMissing.length}`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // Intercetta le XHR per capire l'API
    const xhrLog = [];
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('dcsnprr') || url.includes('ucm') || url.includes('provvediment') || url.includes('ricerca')) {
            if (response.status() === 200 && response.headers()['content-type']?.includes('json')) {
                try {
                    const body = await response.text();
                    xhrLog.push({ url: url.substring(0, 150), size: body.length, preview: body.substring(0, 200) });
                } catch {}
            }
        }
    });

    console.log('📡 Navigazione a ricerca decisioni...');
    await page.goto('https://www.giustizia-amministrativa.it/dcsnprr', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });
    await sleep(3000);

    // Esplora la pagina di ricerca
    const formInfo = await page.evaluate(() => {
        // Cerca il form di ricerca avanzata
        const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
        return inputs.map(i => ({
            tag: i.tagName,
            name: i.name,
            id: i.id,
            type: i.type,
            placeholder: i.placeholder,
            className: i.className?.substring(0, 50),
            visible: i.offsetParent !== null,
            value: i.value,
            options: i.tagName === 'SELECT' ? Array.from(i.options).slice(0, 15).map(o => ({ val: o.value, text: o.text?.trim()?.substring(0, 30) })) : undefined
        }));
    });

    console.log('\n=== CAMPI DISPONIBILI ===');
    for (const f of formInfo) {
        if (f.visible || f.name) {
            console.log(`  [${f.tag}] name="${f.name}" id="${f.id}" type="${f.type}" ${f.placeholder || ''}`);
            if (f.options) {
                console.log('    Options:', f.options.map(o => o.val + ':' + o.text).join(' | '));
            }
        }
    }

    // Cerchiamo i bottoni
    const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, input[type=submit], a.btn'))
            .map(b => ({ text: b.textContent?.trim()?.substring(0, 30), id: b.id, class: b.className?.substring(0, 50), visible: b.offsetParent !== null }))
            .filter(b => b.visible || b.text);
    });
    console.log('\nBottoni:', buttons);

    // Prova a cliccare "Ricerca Avanzata" se c'è un toggle
    try {
        await page.click('text=Ricerca Avanzata');
        await sleep(1000);
        console.log('\nCliccato Ricerca Avanzata');
        
        // Ri-scan dei campi
        const formInfo2 = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input, select'));
            return inputs.filter(i => i.offsetParent !== null).map(i => ({
                tag: i.tagName, name: i.name, id: i.id, type: i.type,
                options: i.tagName === 'SELECT' ? Array.from(i.options).slice(0, 10).map(o => o.value + ':' + o.text?.trim()?.substring(0, 30)) : undefined
            }));
        });
        console.log('Campi visibili dopo toggle:');
        for (const f of formInfo2) {
            console.log(`  [${f.tag}] name="${f.name}" id="${f.id}"`);
            if (f.options) console.log('    ' + f.options.join(' | '));
        }
    } catch(e) {
        console.log('Toggle non trovato:', e.message.substring(0, 50));
    }

    // Cattura screenshot per debug
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'ga_search_page.png'), fullPage: true });
    console.log('\n📸 Screenshot salvato in sentenze_admin_mancanti/ga_search_page.png');

    await browser.close();
}

main().catch(console.error);
