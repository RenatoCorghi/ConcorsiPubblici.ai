/**
 * SCRAPER CASSAZIONE SEZ. SEMPLICI — Mancanti Post-2021
 * 
 * Usa ItalGiure Solr per recuperare le ~198 sentenze citate nelle riviste
 * ma non presenti nel nostro archivio sentenze_sez_semplici/.
 * 
 * Output: sentenze_sez_semplici/{anno}/sn{sez}{anno}{num}.md
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('./sentenze_sez_semplici');
const DELAY_MS = 600;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Mapping sezione -> prefisso ItalGiure e collection
const SEZ_MAP = {
    'civ': { prefix: 'snciv', collection: 'sn-collection', label: 'Civ.' },
    'pen': { prefix: 'snpen', collection: 'sn-collection', label: 'Pen.' },
    'lav': { prefix: 'snciv', collection: 'sn-collection', label: 'Lav.' },  // lavoro è in snciv
    'trib': { prefix: 'snciv', collection: 'sn-collection', label: 'Trib.' }
};

function getSolrEndpoint() {
    return 'https://www.italgiure.giustizia.it/sncass/isapi/hc.dll/sn.solr/sn-collection/select?app.query';
}

async function callSolr(page, params) {
    const body = new URLSearchParams(params).toString();
    return await page.evaluate(async (ep, b) => {
        try {
            const res = await fetch(ep, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: b
            });
            if (!res.ok) return { error: `HTTP ${res.status}` };
            return await res.json();
        } catch (e) {
            return { error: e.message };
        }
    }, getSolrEndpoint(), body);
}

async function searchSentenza(page, numero, anno, sezione) {
    const paddedNum = String(numero).padStart(5, '0');
    const sez = SEZ_MAP[sezione] || SEZ_MAP['civ'];
    
    // Strategia 1: numdec + anno (senza filtro szdec per sez semplici)
    let result = await callSolr(page, {
        q: `numdec:"${paddedNum}" AND anno:"${anno}"`,
        rows: '10',
        wt: 'json',
        fl: 'id,numdec,anno,dtdec,dtpub,rubrica,oggetto,massa,ocr,ocrfull,testo,tipoprov,szdec'
    });
    
    if (result.response?.numFound > 0) {
        // Filtra per la sezione giusta
        const docs = result.response.docs;
        // Preferisci doc con il prefisso giusto
        const matching = docs.filter(d => d.id?.startsWith(sez.prefix));
        if (matching.length > 0) return { doc: matching[0], strategy: 'numdec+prefix' };
        // Fallback: primo risultato
        return { doc: docs[0], strategy: 'numdec' };
    }
    
    // Strategia 2: numero non padded
    result = await callSolr(page, {
        q: `numdec:"${numero}" AND anno:"${anno}"`,
        rows: '5',
        wt: 'json',
        fl: 'id,numdec,anno,dtdec,dtpub,rubrica,oggetto,massa,ocr,ocrfull,testo,tipoprov,szdec'
    });
    
    if (result.response?.numFound > 0) {
        return { doc: result.response.docs[0], strategy: 'numdec_raw' };
    }
    
    return null;
}

async function fetchFullText(page, docId) {
    const result = await callSolr(page, {
        q: `id:"${docId}"`,
        rows: '1',
        wt: 'json',
        fl: '',
        hl: 'true',
        'hl.fl': '*',
        'hl.fragsize': '0',
        'hl.simple.pre': '',
        'hl.simple.post': '',
    });
    
    if (result.error || !result.response?.docs?.length) return null;
    
    const doc = result.response.docs[0];
    const hl = result.highlighting?.[docId];
    
    let testo = null;
    if (hl) {
        const hlText = hl.ocr || hl.ocrfull || hl.testo;
        if (hlText && hlText.length > 0) {
            testo = Array.isArray(hlText) ? hlText.join('\n\n') : hlText;
        }
    }
    
    if (!testo || testo.length < 200) {
        testo = doc.ocr || doc.ocrfull || doc.testo;
        if (Array.isArray(testo)) testo = testo.join('\n\n');
    }
    
    return { doc, testo };
}

function formatContent(doc, testo, numero, anno, sezione) {
    const dataPub = doc.dtpub ? doc.dtpub.split('T')[0] : (doc.dtdec ? doc.dtdec.split('T')[0] : '');
    const sezLabel = SEZ_MAP[sezione]?.label || 'Civ.';

    let content = `# [Cass. ${sezLabel}, Sez. Semplice, ${dataPub}, n. ${numero}/${anno}]\n\n`;
    if (doc.rubrica) content += `**Rubrica:** ${doc.rubrica}\n\n`;
    if (doc.oggetto) content += `**Oggetto:** ${doc.oggetto}\n\n`;
    
    if (testo && testo.length > 200) {
        testo = testo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        content += testo;
    } else if (doc.massa) {
        content += Array.isArray(doc.massa) ? doc.massa.join('\n\n') : doc.massa;
    }
    
    return content;
}

async function main() {
    console.log('\n🚀 Scraper Cass. Sez. Semplici — Post-2021 Mancanti');
    console.log('═'.repeat(55) + '\n');

    const missing = JSON.parse(fs.readFileSync('data/cass_sez_mancanti_post21.json', 'utf8'))
        .sort((a, b) => b.citazioni - a.citazioni);
    
    console.log(`🎯 Sentenze da cercare: ${missing.length}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log('📡 Connessione a ItalGiure...');
    await page.goto('https://www.italgiure.giustizia.it/sncass/', { 
        waitUntil: 'domcontentloaded', timeout: 30000 
    });
    await sleep(3000);

    // Test
    const test = await callSolr(page, { q: '*:*', rows: '1', wt: 'json', fl: 'id' });
    if (test.error) {
        console.error('❌ Connessione fallita:', test.error);
        await browser.close();
        process.exit(1);
    }
    console.log(`✅ Connesso! (${test.response?.numFound} docs nel DB)\n`);

    let downloaded = 0, notFound = 0, noText = 0, errors = 0;

    for (let i = 0; i < missing.length; i++) {
        const s = missing[i];
        const prefix = `[${i+1}/${missing.length}]`;
        
        process.stdout.write(`${prefix} ${s.sezione} n.${s.numero}/${s.anno} (${s.citazioni}x)... `);
        
        await sleep(DELAY_MS);

        try {
            const result = await searchSentenza(page, s.numero, s.anno, s.sezione);
            
            if (!result) {
                console.log('❌ Non trovata');
                notFound++;
                continue;
            }

            const doc = result.doc;
            const docId = doc.id;

            await sleep(300);
            const fullResult = await fetchFullText(page, docId);
            
            let testo = fullResult?.testo;
            
            if (!testo || testo.length < 200) {
                if (doc.massa) {
                    // Solo massima — salva comunque
                } else {
                    console.log('⚠️ Senza testo');
                    noText++;
                    continue;
                }
            }

            // Salva
            const annoStr = String(s.anno);
            const outDir = path.join(OUTPUT_DIR, annoStr);
            fs.mkdirSync(outDir, { recursive: true });

            const content = formatContent(fullResult?.doc || doc, testo, s.numero, annoStr, s.sezione);
            const filePath = path.join(outDir, `${docId}.md`);
            fs.writeFileSync(filePath, content, 'utf8');
            downloaded++;

            console.log(`✅ (${(content.length/1024).toFixed(1)} KB)`);

        } catch (e) {
            console.log('💥 ' + e.message?.substring(0, 60));
            errors++;
            if (e.message?.includes('Session') || e.message?.includes('Target closed')) {
                console.log('🔄 Riconnessione...');
                try {
                    await page.goto('https://www.italgiure.giustizia.it/sncass/', { 
                        waitUntil: 'domcontentloaded', timeout: 30000 
                    });
                    await sleep(3000);
                } catch (e2) {
                    console.error('Riconnessione fallita.');
                    break;
                }
            }
        }

        if ((i + 1) % 50 === 0) {
            console.log(`\n📊 Progresso: ${downloaded} scaricate | ${notFound} non trovate | ${noText} senza testo | ${errors} errori\n`);
        }
    }

    await browser.close();

    console.log('\n' + '═'.repeat(55));
    console.log('📊 RISULTATO FINALE — Cass. Sez. Semplici Post-2021');
    console.log(`   ✅ Scaricate: ${downloaded}`);
    console.log(`   ❌ Non trovate: ${notFound}`);
    console.log(`   ⚠️  Senza testo: ${noText}`);
    console.log(`   💥 Errori: ${errors}`);
    console.log('═'.repeat(55));
}

main().catch(console.error);
