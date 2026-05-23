/**
 * SCRAPER SS.UU. PRE-2021 — ItalGiure interfaccia classica
 * 
 * L'API Solr copre solo dal 2021. Per le sentenze più vecchie,
 * usiamo l'interfaccia di ricerca classica di ItalGiure.
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('./sentenze_ssuu_vip');
const DELAY_MS = 1500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadMissing() {
    const report = JSON.parse(fs.readFileSync('data/ssuu_crossref_report.json', 'utf8'));
    return report.lista_mancanti
        .filter(s => s.anno < 2021)
        .sort((a, b) => b.citazioni - a.citazioni);
}

async function main() {
    console.log('\n🚀 Scraper SS.UU. Pre-2021 — ItalGiure Ricerca Classica');
    console.log('═'.repeat(55) + '\n');

    const missing = loadMissing();
    console.log(`🎯 Sentenze pre-2021 da cercare: ${missing.length}`);

    const limitArg = process.argv.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : missing.length;

    const browser = await puppeteer.launch({
        headless: false, // visible per debug
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // Naviga alla ricerca ItalGiure
    console.log('📡 Navigazione a ItalGiure...');
    await page.goto('https://www.italgiure.giustizia.it/sncass/', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    // Verifica se c'è un endpoint di ricerca alternativo per l'archivio storico
    // L'interfaccia storica usa: /sncass/isapi/hc.dll/sn.hc.disp
    const CLASSIC_EP = 'https://www.italgiure.giustizia.it/sncass/isapi/hc.dll/sn.hc.disp';
    
    // Test: cerca la sentenza più citata n.38343/2014
    console.log('\nTest ricerca n.38343/2014 via interfaccia classica...');
    
    // Prova query via URL diretta
    const testUrl = `https://www.italgiure.giustizia.it/sncass/isapi/hc.dll/sn.hc.disp?szDec=U&numdec=38343&anno=2014`;
    console.log('URL:', testUrl);
    
    const response = await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);
    
    const pageContent = await page.content();
    const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');
    console.log('Status:', response.status());
    console.log('Contenuto (primi 500 chars):', pageText.substring(0, 500));
    
    // Prova anche la ricerca tramite form
    console.log('\n--- Prova via form ---');
    await page.goto('https://www.italgiure.giustizia.it/sncass/', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);
    
    // Verifica cosa c'è nella pagina
    const formInfo = await page.evaluate(() => {
        const forms = Array.from(document.forms);
        const inputs = Array.from(document.querySelectorAll('input'));
        const links = Array.from(document.querySelectorAll('a')).map(a => ({ text: a.textContent?.trim()?.substring(0, 50), href: a.href?.substring(0, 100) })).filter(l => l.text);
        return {
            forms: forms.length,
            inputs: inputs.map(i => ({ name: i.name, id: i.id, type: i.type })),
            links: links.slice(0, 20)
        };
    });
    console.log('Forms:', formInfo.forms);
    console.log('Inputs:', JSON.stringify(formInfo.inputs));
    console.log('Links:', JSON.stringify(formInfo.links.slice(0, 10), null, 2));
    
    await browser.close();
}

main().catch(console.error);
