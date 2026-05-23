import puppeteer from 'puppeteer';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // Naviga alla pagina principale
    console.log('📡 Navigazione a ItalGiure...');
    await page.goto('https://www.italgiure.giustizia.it/sncass/', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    // Compila il form con gli estremi della sentenza n.38343/2014
    console.log('\nTest: ricerca n.38343/2014 via form...');
    
    // Il campo "estremi" sembra essere per numero/anno
    await page.evaluate(() => {
        // Imposta i campi del form
        const estremi = document.getElementById('estremi');
        const szdec = document.getElementById('[szdec]');
        const anno = document.getElementById('[anno]');
        
        if (estremi) estremi.value = '38343';
        if (szdec) szdec.value = 'U';
        if (anno) anno.value = '2014';
    });

    // Clicca il bottone di ricerca (startquery)
    const startBtn = await page.$('#startquery');
    if (startBtn) {
        await startBtn.click();
    } else {
        // Prova submit del form
        await page.evaluate(() => document.forms[0]?.submit());
    }
    
    await sleep(5000);

    // Intercetta le richieste XHR fatte dal form
    const url = page.url();
    console.log('URL dopo submit:', url);
    
    const content = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');
    console.log('Contenuto:', content.substring(0, 500));

    // Alternativa: usa direttamente l'endpoint Solr ma con parametro di ricerca diverso
    // Potrebbe esserci un archivio "storico" con endpoint diverso
    console.log('\n--- Test archivi alternativi ---');
    
    // Prova endpoint Solr con search text
    const SOLR_EP = 'https://www.italgiure.giustizia.it/sncass/isapi/hc.dll/sn.solr/sn-collection/select?app.query';
    
    // Cerca per estremi (combinazione anno+numero nel campo generico)
    const tests = [
        { q: 'estremi:"38343/2014"', label: 'estremi' },
        { q: '38343', fq: 'anno:"2014"', label: 'fulltext+fq' },
        { q: '*:*', fq: 'numdec:"38343"', label: 'wildcard+fq' },
    ];

    for (const t of tests) {
        const params = { q: t.q, rows: '3', wt: 'json', fl: 'id,numdec,anno' };
        if (t.fq) params.fq = t.fq;
        
        const result = await page.evaluate(async (ep, params) => {
            const body = new URLSearchParams(params).toString();
            const res = await fetch(ep, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                body
            });
            if (!res.ok) return { error: 'HTTP ' + res.status };
            return await res.json();
        }, SOLR_EP, params);
        
        console.log(`  ${t.label}: ${result.response?.numFound ?? result.error} risultati`);
        if (result.response?.docs?.length) {
            result.response.docs.forEach(d => console.log(`    id=${d.id} numdec=${d.numdec} anno=${d.anno}`));
        }
    }

    // Test: l'archivio storico potrebbe essere su un endpoint diverso
    // ItalGiure ha anche /snciv/ /snpen/ ecc.
    const endpoints = [
        'https://www.italgiure.giustizia.it/snciv/',
        'https://www.italgiure.giustizia.it/snpen/',
    ];
    
    for (const ep of endpoints) {
        try {
            const resp = await page.goto(ep, { waitUntil: 'domcontentloaded', timeout: 10000 });
            console.log(`\n${ep}: status=${resp.status()}`);
            const txt = await page.evaluate(() => document.body?.innerText?.substring(0, 200) || '');
            console.log('  Content:', txt.substring(0, 100));
        } catch(e) {
            console.log(`\n${ep}: ${e.message.substring(0, 50)}`);
        }
    }

    await browser.close();
}
main().catch(console.error);
