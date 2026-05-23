/**
 * SCRAPER GA v3 — Usa il portale CdS/TAR con Puppeteer per ottenere nrg,
 * poi scarica il testo dal MDP.
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('./sentenze_admin_mancanti');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Prefissi portlet
const CDS_PFX = '_it_indra_ga_institutional_area_JurisdictionalActivityAdministrativeActsWebPortlet_INSTANCE_hS5qHHa9EzvH_';

function extractTextFromXML(xml) {
    if (!xml) return null;
    let text = xml
        .replace(/<\?xml[^?]*\?>/g, '')
        .replace(/<\?xml-stylesheet[^?]*\?>/g, '')
        .replace(/<h:div\s*\/>/g, '\n')
        .replace(/<\/h:div>/g, '\n')
        .replace(/<h:div[^>]*>/g, '')
        .replace(/<corsivo>/g, '*').replace(/<\/corsivo>/g, '*')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
        .replace(/\t+/g, ' ').replace(/ +/g, ' ')
        .replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    return text;
}

async function searchCdS(page, numero, anno) {
    await page.goto('https://www.giustizia-amministrativa.it/web/guest/provvedimenti-cds', {
        waitUntil: 'networkidle2', timeout: 30000
    });
    await sleep(2000);

    // Compila il form CdS
    await page.select(`#${CDS_PFX}year`, String(anno));
    await sleep(300);
    
    const numField = await page.$(`#${CDS_PFX}number`);
    if (numField) {
        await numField.click({ clickCount: 3 });
        await numField.type(String(numero));
    }
    await sleep(300);

    // Clicca Cerca
    await page.click(`#${CDS_PFX}search`);
    await sleep(4000);

    // Leggi i risultati dalla tabella DataTables
    const results = await page.evaluate(() => {
        const rows = document.querySelectorAll('.dataTables_scrollBody tr, table tbody tr');
        const items = [];
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
                const text = row.innerText || '';
                // Cerca NRG nel row data o attributi
                const nrgMatch = text.match(/(\d{9,})/);
                items.push({
                    text: text.substring(0, 150),
                    cells: Array.from(cells).map(c => c.innerText?.trim()?.substring(0, 50)),
                    nrg: nrgMatch ? nrgMatch[1] : null,
                    rowId: row.id || row.getAttribute('data-id')
                });
            }
        }
        return items;
    });

    // Se ci sono risultati, clicca sulla riga SENTENZA per attivare Visualizza
    if (results.length > 0) {
        // Trova la riga SENTENZA
        const sentenzaRow = results.findIndex(r => 
            r.text.includes('SENTENZA') && !r.text.includes('DISPOSITIVO')
        );
        const rowIdx = sentenzaRow >= 0 ? sentenzaRow : 0;

        // Clicca sulla riga
        await page.evaluate((idx) => {
            const rows = document.querySelectorAll('.dataTables_scrollBody tr, table tbody tr');
            let count = 0;
            for (const row of rows) {
                if (row.querySelectorAll('td').length >= 3) {
                    if (count === idx) { row.click(); break; }
                    count++;
                }
            }
        }, rowIdx);
        await sleep(1000);

        // Clicca Visualizza per ottenere l'URL MDP
        let mdpUrl = null;
        
        // Intercetta la navigazione
        const newPagePromise = new Promise(resolve => {
            page.browser().once('targetcreated', async (target) => {
                const newPage = await target.page();
                if (newPage) {
                    mdpUrl = newPage.url();
                    resolve(newPage);
                }
            });
            setTimeout(() => resolve(null), 5000);
        });

        try {
            await page.click(`#${CDS_PFX}showFile`);
        } catch(e) {
            // Prova bottone Visualizza generico
            await page.evaluate(() => {
                const btns = document.querySelectorAll('button');
                for (const b of btns) {
                    if (b.textContent?.includes('Visualizza')) { b.click(); break; }
                }
            });
        }

        const newPage = await newPagePromise;
        
        if (newPage && !mdpUrl?.includes('about:blank')) {
            mdpUrl = newPage.url();
            // Estrai nrg dall'URL MDP
            const nrgMatch = mdpUrl?.match(/nrg=(\d+)/);
            const nrg = nrgMatch ? nrgMatch[1] : null;
            
            // Leggi il contenuto della nuova pagina
            await sleep(2000);
            const pageText = await newPage.evaluate(() => document.body?.innerText || '');
            await newPage.close();
            
            if (pageText && pageText.length > 500) {
                return { found: true, text: pageText, nrg };
            }
        }

        // Fallback: costruisci URL MDP direttamente
        // nomeFile = YYYYNNNNN_11.xml
        const nomeFile = `${anno}${String(numero).padStart(5, '0')}_11.xml`;
        const mdpDirect = `https://mdp.giustizia-amministrativa.it/visualizza/?nodeRef=&schema=cds&nrg=&nomeFile=${nomeFile}&subDir=Provvedimenti`;
        
        try {
            const res = await page.evaluate(async (url) => {
                const r = await fetch(url);
                return { ok: r.ok, text: await r.text() };
            }, mdpDirect);
            
            if (res.ok && res.text.length > 500 && !res.text.includes('Pagina non trovata')) {
                const clean = res.text
                    .replace(/<[^>]+>/g, '')
                    .replace(/&[a-z]+;/g, ' ')
                    .replace(/\s+/g, ' ').trim();
                if (clean.length > 300) {
                    return { found: true, text: clean };
                }
            }
        } catch(e) {}
    }

    return { found: false };
}

// Mappa Sede TAR (da nome descrittivo a value della select)
const TAR_SEDI = {
    'Lazio': 'rm',
    'Lombardia': 'mi',
    'Campania': 'na',
    'Puglia': 'ba',
    'Veneto': 've',
    'Sicilia': 'pa',
    'Piemonte': 'to',
    'Toscana': 'fi',
    'Emilia-Romagna': 'bo',
    'Calabria': 'cz',
    'Sardegna': 'ca',
    'Abruzzo': 'aq',
    'Liguria': 'ge',
    'Marche': 'an',
    'Umbria': 'pg',
    'Friuli-Venezia Giulia': 'ts',
    'Trentino-Alto Adige': 'tn',
    'Basilicata': 'pz',
    'Molise': 'cb',
    "Valle d'Aosta": 'ao',
    'Brescia': 'bs' // Caso particolare (sez. staccata)
};

async function searchTAR(page, numero, anno, sedeNome) {
    await page.goto('https://www.giustizia-amministrativa.it/web/guest/provvedimenti-tar', {
        waitUntil: 'networkidle2', timeout: 30000
    });
    await sleep(2000);

    const sedeValue = TAR_SEDI[sedeNome];
    if (!sedeValue) {
        console.log(`(Sede TAR non mappata: ${sedeNome})`);
        return { found: false };
    }

    // Compila il form TAR
    await page.select(`#${CDS_PFX}RicercaTribunale`, sedeValue);
    await sleep(300);

    await page.select(`#${CDS_PFX}year`, String(anno));
    await sleep(300);
    
    const numField = await page.$(`#${CDS_PFX}number`);
    if (numField) {
        await numField.click({ clickCount: 3 });
        await numField.type(String(numero));
    }
    await sleep(300);

    // Clicca Cerca
    await page.click(`#${CDS_PFX}search`);
    await sleep(4000);

    // Leggi i risultati dalla tabella DataTables
    const results = await page.evaluate(() => {
        const rows = document.querySelectorAll('.dataTables_scrollBody tr, table tbody tr');
        const items = [];
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
                const text = row.innerText || '';
                items.push({
                    text: text.substring(0, 150),
                    rowId: row.id || row.getAttribute('data-id')
                });
            }
        }
        return items;
    });

    if (results.length > 0) {
        // Clicca sulla riga
        await page.evaluate(() => {
            const rows = document.querySelectorAll('.dataTables_scrollBody tr, table tbody tr');
            for (const row of rows) {
                if (row.querySelectorAll('td').length >= 3) {
                    row.click(); break;
                }
            }
        });
        await sleep(1000);

        let mdpUrl = null;
        const newPagePromise = new Promise(resolve => {
            page.browser().once('targetcreated', async (target) => {
                const newPage = await target.page();
                if (newPage) {
                    mdpUrl = newPage.url();
                    resolve(newPage);
                }
            });
            setTimeout(() => resolve(null), 5000);
        });

        try { await page.click(`#${CDS_PFX}showFile`); } 
        catch(e) {
            await page.evaluate(() => {
                const btns = document.querySelectorAll('button');
                for (const b of btns) {
                    if (b.textContent?.includes('Visualizza')) { b.click(); break; }
                }
            });
        }

        const newPage = await newPagePromise;
        if (newPage && !mdpUrl?.includes('about:blank')) {
            await sleep(2000);
            const pageText = await newPage.evaluate(() => document.body?.innerText || '');
            await newPage.close();
            if (pageText && pageText.length > 500 && !pageText.includes('Pagina non trovata')) {
                return { found: true, text: pageText };
            }
        }
    }
    return { found: false };
}

async function fetchMDP(numero, anno, schema = 'cds') {
    // Prova direttamente l'endpoint MDP con vari formati di nomeFile
    const numPadded = String(numero).padStart(5, '0');
    const suffixes = ['11', '01', '12', '02'];
    const exts = ['xml', 'html'];
    
    for (const ext of exts) {
        for (const suffix of suffixes) {
            const nomeFile = `${anno}${numPadded}_${suffix}.${ext}`;
            const url = `https://mdp.giustizia-amministrativa.it/visualizza/?nodeRef=&schema=${schema}&nrg=&nomeFile=${nomeFile}&subDir=Provvedimenti`;
            
            try {
                const res = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: AbortSignal.timeout(10000)
                });
                if (!res.ok) continue;
                const raw = await res.text();
                if (raw.length < 500) continue;
                if (raw.includes('Pagina non trovata') || raw.includes('404')) continue;
                
                const text = extractTextFromXML(raw);
                if (text && text.length > 300) {
                    return text;
                }
            } catch {}
        }
    }
    return null;
}

async function main() {
    console.log('\n🚀 Scraper GA v3 — CdS/TAR Mancanti');
    console.log('═'.repeat(55) + '\n');

    const data = JSON.parse(fs.readFileSync('data/riviste_sentenze_index.json', 'utf8'));
    const allMissing = data.sentenze
        .filter(s => s.corte === 'TAR' || s.corte === 'Consiglio di Stato')
        .map(s => ({
            ...s,
            corte_tipo: s.corte === 'Consiglio di Stato' ? 'CdS' : 'TAR',
            schema: s.corte === 'Consiglio di Stato' ? 'cds' : ''
        }))
        .sort((a, b) => b.citazioni - a.citazioni);

    // Filtra già scaricate (>3KB)
    const toProcess = allMissing.filter(s => {
        const f = path.join(OUTPUT_DIR, `${s.corte_tipo}_${s.anno}_${s.numero}.md`);
        if (!fs.existsSync(f)) return true;
        return fs.statSync(f).size < 3000;
    });

    const limitArg = process.argv.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : toProcess.length;
    console.log(`🎯 Da processare: ${Math.min(limit, toProcess.length)} (${allMissing.length - toProcess.length} già OK)`);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Fase 1: Prova MDP diretto (veloce, senza Puppeteer)
    console.log('\n📡 Fase 1: MDP diretto...');
    let directDL = 0;
    const needsPuppeteer = [];

    for (let i = 0; i < Math.min(limit, toProcess.length); i++) {
        const s = toProcess[i];
        if (s.corte_tipo !== 'CdS') { needsPuppeteer.push(s); continue; }
        
        process.stdout.write(`  [${i+1}] CdS n.${s.numero}/${s.anno}... `);
        
        const text = await fetchMDP(s.numero, s.anno, 'cds');
        if (text) {
            const outFile = path.join(OUTPUT_DIR, `CdS_${s.anno}_${s.numero}.md`);
            const header = `# [Consiglio di Stato, Sentenza n. ${s.numero}/${s.anno}]\n\n`;
            fs.writeFileSync(outFile, header + text, 'utf8');
            directDL++;
            console.log(`✅ MDP (${(text.length/1024).toFixed(1)} KB)`);
        } else {
            console.log('❌ MDP fallito');
            needsPuppeteer.push(s);
        }
        
        await sleep(500);
    }

    console.log(`\n📊 Fase 1: ${directDL} scaricate via MDP | ${needsPuppeteer.length} necessitano Puppeteer`);

    // Fase 2: Puppeteer per quelle non trovate via MDP
    if (needsPuppeteer.length > 0) {
        console.log('\n📡 Fase 2: Puppeteer...');
        
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        let puppDL = 0, notFound = 0;
        
        for (let i = 0; i < needsPuppeteer.length; i++) {
            const s = needsPuppeteer[i];
            process.stdout.write(`  [${i+1}/${needsPuppeteer.length}] ${s.corte_tipo} n.${s.numero}/${s.anno} (${s.citazioni}x)... `);

            try {
                if (s.corte_tipo === 'CdS') {
                    const result = await searchCdS(page, s.numero, s.anno);
                    if (result.text && result.text.length > 500) {
                        const outFile = path.join(OUTPUT_DIR, `CdS_${s.anno}_${s.numero}.md`);
                        const header = `# [Consiglio di Stato, Sentenza n. ${s.numero}/${s.anno}]\n\n`;
                        fs.writeFileSync(outFile, header + result.text, 'utf8');
                        puppDL++;
                        console.log(`✅ (${(result.text.length/1024).toFixed(1)} KB)`);
                    } else {
                        console.log('❌');
                        notFound++;
                    }
                } else if (s.corte_tipo === 'TAR') {
                    const sede = s.sezione && s.sezione !== 'Sconosciuta' ? s.sezione : 'Lazio';

                    const result = await searchTAR(page, s.numero, s.anno, sede);
                    if (result.text && result.text.length > 500) {
                        const outFile = path.join(OUTPUT_DIR, `TAR_${s.anno}_${s.numero}.md`);
                        const header = `# [TAR ${sede}, Sentenza n. ${s.numero}/${s.anno}]\n\n`;
                        fs.writeFileSync(outFile, header + result.text, 'utf8');
                        puppDL++;
                        console.log(`✅ (${(result.text.length/1024).toFixed(1)} KB)`);
                    } else {
                        console.log('❌');
                        notFound++;
                    }
                }
            } catch(e) {
                console.log('💥 ' + e.message.substring(0, 50));
                notFound++;
            }

            await sleep(2000);
        }

        await browser.close();
        console.log(`\n📊 Fase 2: ${puppDL} scaricate via Puppeteer | ${notFound} non trovate`);
    }
}

main().catch(console.error);
