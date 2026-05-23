/**
 * SCRAPER MIRATO v3 — SS.UU. Mancanti (Post-2021)
 * 
 * ItalGiure Solr copre solo dal 2021. Cerca con numdec padded a 5 cifre.
 * Per le pre-2021 serve un approccio diverso.
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('./sentenze_ssuu_vip');
const DELAY_MS = 800;
const SOLR_EP = 'https://www.italgiure.giustizia.it/sncass/isapi/hc.dll/sn.solr/sn-collection/select?app.query';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadMissing() {
    // Usa la lista precisa generata dal cross-ref corretto
    if (fs.existsSync('data/ssuu_mancanti_post21.json')) {
        return JSON.parse(fs.readFileSync('data/ssuu_mancanti_post21.json', 'utf8'))
            .sort((a, b) => b.citazioni - a.citazioni);
    }
    // Fallback al report vecchio
    const report = JSON.parse(fs.readFileSync('data/ssuu_crossref_report.json', 'utf8'));
    return report.lista_mancanti
        .filter(s => s.anno >= 2021)
        .sort((a, b) => b.citazioni - a.citazioni);
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
    }, SOLR_EP, body);
}

async function searchSentenza(page, numero, anno) {
    const paddedNum = String(numero).padStart(5, '0');
    
    // Strategia: numdec padded + anno
    const result = await callSolr(page, {
        q: `numdec:"${paddedNum}" AND anno:"${anno}"`,
        rows: '5',
        wt: 'json',
        fl: 'id,numdec,anno,dtdec,dtpub,rubrica,oggetto,massa,ocr,ocrfull,testo,tipoprov,szdec'
    });
    
    if (result.response?.numFound > 0) {
        return { doc: result.response.docs[0], strategy: 'numdec' };
    }
    
    return null;
}

async function fetchFullText(page, docId) {
    // Fetch il documento completo con tutti i campi testo
    // Simula la richiesta del tasto "T" di ItalGiure
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
    
    // Testo dal highlighting (dove ItalGiure mette il testo OCR completo)
    let testo = null;
    if (hl) {
        const hlText = hl.ocr || hl.ocrfull || hl.testo;
        if (hlText && hlText.length > 0) {
            testo = Array.isArray(hlText) ? hlText.join('\n\n') : hlText;
        }
    }
    
    // Fallback sul doc
    if (!testo || testo.length < 200) {
        testo = doc.ocr || doc.ocrfull || doc.testo;
        if (Array.isArray(testo)) testo = testo.join('\n\n');
    }
    
    return { doc, testo };
}

function formatContent(doc, testo, sentenzaNum, anno) {
    const dataPub = doc.dtpub ? doc.dtpub.split('T')[0] : (doc.dtdec ? doc.dtdec.split('T')[0] : '');
    const tipoSez = (doc.id || '').startsWith('snpen') ? 'Pen.' : 'Civ.';

    let content = `# [Cass. ${tipoSez}, Sez. Un., ${dataPub}, n. ${sentenzaNum}/${anno}]\n\n`;
    if (doc.rubrica) content += `**Rubrica:** ${doc.rubrica}\n\n`;
    if (doc.oggetto) content += `**Oggetto:** ${doc.oggetto}\n\n`;
    
    if (testo && testo.length > 200) {
        // Cleanup HTML
        testo = testo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        content += testo;
    } else if (doc.massa) {
        content += Array.isArray(doc.massa) ? doc.massa.join('\n\n') : doc.massa;
    }
    
    return content;
}

async function main() {
    console.log('\n🚀 Scraper SS.UU. Mancanti — Post-2021 (ItalGiure Solr)');
    console.log('═'.repeat(55) + '\n');

    const missing = loadMissing();
    console.log(`🎯 Sentenze post-2021 da cercare: ${missing.length}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log('📡 Connessione a ItalGiure...');
    await page.goto('https://www.italgiure.giustizia.it/sncass/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // Test connessione
    const test = await callSolr(page, { q: 'szdec:"U"', rows: '1', wt: 'json', fl: 'id' });
    if (test.error) {
        console.error('❌ Connessione fallita:', test.error);
        await browser.close();
        process.exit(1);
    }
    console.log(`✅ Connesso! (${test.response?.numFound} SS.UU. nel DB)\n`);

    let downloaded = 0, notFound = 0, noText = 0, errors = 0, massimaOnly = 0;
    const notFoundList = [];

    for (let i = 0; i < missing.length; i++) {
        const s = missing[i];
        const prefix = `[${i+1}/${missing.length}]`;
        
        process.stdout.write(`${prefix} n.${s.numero}/${s.anno} (${s.citazioni}x)... `);
        
        await sleep(DELAY_MS);

        try {
            // Step 1: Cerca la sentenza
            const result = await searchSentenza(page, s.numero, s.anno);
            
            if (!result) {
                console.log('❌ Non trovata');
                notFound++;
                notFoundList.push(s);
                continue;
            }

            const doc = result.doc;
            const docId = doc.id;

            // Step 2: Fetch testo completo
            await sleep(400);
            const fullResult = await fetchFullText(page, docId);
            
            let testo = fullResult?.testo;
            let textType = 'completo';
            
            if (!testo || testo.length < 200) {
                // Solo massima disponibile
                if (doc.massa) {
                    textType = 'massima';
                    massimaOnly++;
                } else {
                    console.log('⚠️ Senza testo e senza massima');
                    noText++;
                    continue;
                }
            }

            // Step 3: Salva
            const anno = String(s.anno);
            const outDir = path.join(OUTPUT_DIR, anno);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

            const content = formatContent(fullResult?.doc || doc, testo, s.numero, anno);
            const filePath = path.join(outDir, `${docId}.md`);
            fs.writeFileSync(filePath, content, 'utf8');
            downloaded++;

            console.log(`✅ ${textType} (${(content.length/1024).toFixed(1)} KB)`);

        } catch (e) {
            console.log('💥 ' + e.message);
            errors++;
            if (e.message.includes('Session') || e.message.includes('Target closed') || e.message.includes('detached')) {
                console.log('🔄 Riconnessione...');
                try {
                    await page.goto('https://www.italgiure.giustizia.it/sncass/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await sleep(3000);
                } catch (e2) {
                    console.error('Riconnessione fallita.');
                    break;
                }
            }
        }

        if ((i + 1) % 25 === 0) {
            console.log(`\n📊 Progresso: ${downloaded} scaricate | ${notFound} non trovate | ${massimaOnly} solo massima | ${errors} errori\n`);
        }
    }

    await browser.close();

    console.log('\n' + '═'.repeat(55));
    console.log('📊 RISULTATO FINALE — Post-2021');
    console.log(`   ✅ Scaricate: ${downloaded} (di cui ${massimaOnly} solo massima)`);
    console.log(`   ❌ Non trovate: ${notFound}`);
    console.log(`   ⚠️  Senza testo: ${noText}`);
    console.log(`   💥 Errori: ${errors}`);
    console.log('═'.repeat(55));

    if (notFoundList.length > 0) {
        fs.writeFileSync('data/ssuu_post2021_not_found.json', JSON.stringify(notFoundList, null, 2), 'utf8');
        console.log(`\n📄 Non trovate salvate in data/ssuu_post2021_not_found.json`);
    }
}

main().catch(console.error);
