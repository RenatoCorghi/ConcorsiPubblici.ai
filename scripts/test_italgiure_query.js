import puppeteer from 'puppeteer';

const SNCASS_HOME = 'https://www.italgiure.giustizia.it/sncass/';
const SOLR_EP = 'https://www.italgiure.giustizia.it/sncass/isapi/hc.dll/sn.solr/sn-collection/select?app.query';

async function main() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(SNCASS_HOME, { waitUntil: 'domcontentloaded' });
    
    await new Promise(r => setTimeout(r, 2000));
    
    const params = {
        start: '0',
        rows: '5',
        q: 'anno:2025 AND tipoprov:"Sentenza" AND -szdec:"U" AND (ocr:repubblica OR testo:repubblica OR ocr:sentenza OR testo:sentenza)',
        wt: 'json',
        indent: 'on',
        fl: 'id,anno,nprov', 
    };
    
    const body = new URLSearchParams(params).toString();
    const data = await page.evaluate(async (ep, b) => {
        const res = await fetch(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
            body: b
        });
        return await res.json();
    }, SOLR_EP, body);
    
    console.log(JSON.stringify(data, null, 2));
    await browser.close();
}
main().catch(console.error);
