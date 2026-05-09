/**
 * scraper-italgiure-ssuu.js
 * 
 * Scarica le sentenze SS.UU. da ItalGiure usando Puppeteer headless per la gestione dei cookie.
 * 
 * STRATEGIA DEFINITIVA (reverse-engineering Solr):
 * 1. Query Solr globale per ottenere la lista di tutti gli ID (q=szdec:"U")
 * 2. Per ogni ID non presente in locale, esegue una query Solr SPECIFICA (q=id:"...")
 *    per ottenere il campo OCR/testo, imitando esattamente la richiesta del tasto "T".
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// ==========================================
// CONFIGURAZIONE
// ==========================================
const OUTPUT_DIR = path.resolve('./sentenze_ssuu_vip');
const ROWS_PER_PAGE = 100;
const DELAY_MS = 600; // delay tra richieste specifiche per non sovraccaricare

const SNCASS_HOME = 'https://www.italgiure.giustizia.it/sncass/';
const SOLR_EP = 'https://www.italgiure.giustizia.it/sncass/isapi/hc.dll/sn.solr/sn-collection/select?app.query';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ==========================================
// Indice Locale
// ==========================================
function buildLocalIndex() {
    const existing = new Set();
    function scanDir(dir) {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) scanDir(path.join(dir, entry.name));
            else if (entry.name.endsWith('.md')) {
                existing.add(entry.name.replace('.md', ''));
            }
        }
    }
    scanDir(OUTPUT_DIR);
    return existing;
}

// ==========================================
// API Client (iniettato nella pagina)
// ==========================================
async function callSolr(page, queryParams) {
    const body = new URLSearchParams(queryParams).toString();
    return await page.evaluate(async (ep, b) => {
        try {
            const res = await fetch(ep, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*; q=0.01'
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

// ==========================================
// 1. Fetch Lista Base (Paginata)
// ==========================================
async function fetchList(page, start) {
    const params = {
        start: String(start),
        rows: String(ROWS_PER_PAGE),
        q: 'szdec:"U"',
        wt: 'json',
        indent: 'off',
        sort: 'anno asc, numdec asc',
        fl: 'id,tipoprov,nprov,anno,dtdec,dtpub,rubrica,oggetto,massa', // senza testo pesante
    };
    
    const data = await callSolr(page, params);
    if (data.error) throw new Error(data.error);
    return data.response;
}

// ==========================================
// 2. Fetch Singolo Documento Completo
// ==========================================
async function fetchSingleDocFull(page, anno, numdec) {
    // La query esatta che usa ItalGiure quando clicchi la T
    const params = {
        start: '0',
        rows: '1',
        q: `(anno:"${anno}" AND numdec:"${numdec}")`, // ricerca specifica come fa ItalGiure
        wt: 'json',
        indent: 'off',
        fl: '', 
        hl: 'true',
        'hl.fl': '*',
        'hl.fragsize': '0',
        'hl.simple.pre': '<em class="hit">',
        'hl.simple.post': '</em>',
    };
    
    const data = await callSolr(page, params);
    if (data.error || !data.response || !data.response.docs || data.response.docs.length === 0) {
        return null;
    }
    return {
        doc: data.response.docs[0],
        highlighting: data.highlighting ? data.highlighting[data.response.docs[0].id] : null
    };
}

// ==========================================
// MAIN
// ==========================================
async function main() {
    console.log(`\n🚀 Scraper ItalGiure — SS.UU. (API Solr Diretta)`);
    console.log(`${'='.repeat(55)}\n`);

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const localIndex = buildLocalIndex();

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    console.log('📡 Acquisizione cookie di sessione da ItalGiure...');
    await page.goto(SNCASS_HOME, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    let firstPage;
    try {
        firstPage = await fetchList(page, 0);
    } catch (e) {
        console.error('❌ Errore prima query Solr:', e.message);
        await browser.close();
        process.exit(1);
    }

    const total = firstPage.numFound;
    console.log(`✅ Trovate ${total} SS.UU. (Già in locale: ${localIndex.size})\n`);

    let downloaded = 0, skipped = 0, noText = 0, errors = 0;

    for (let start = 0; start < total; start += ROWS_PER_PAGE) {
        const pageNum = Math.floor(start / ROWS_PER_PAGE) + 1;
        
        let result;
        if (start === 0) result = firstPage;
        else {
            try {
                result = await fetchList(page, start);
            } catch (e) {
                console.error(`\n❌ Errore pagina ${pageNum}:`, e.message);
                errors++;
                await sleep(3000);
                continue;
            }
        }

        const newDocs = result.docs.filter(d => !localIndex.has(d.id));
        const skipCount = result.docs.length - newDocs.length;
        skipped += skipCount;

        if (newDocs.length === 0) {
            process.stdout.write(`⏭️  Pagina ${pageNum}: ${skipCount} skip\n`);
            continue;
        }

        console.log(`\n─── Pagina ${pageNum}: ${newDocs.length} nuove sentenze ───`);

        for (const stubDoc of newDocs) {
            const localKey = stubDoc.id;
            
            // Estrazione del numero
            const numMatch = localKey.match(/U(\d+)[SO]?$/);
            const numStr = numMatch ? numMatch[1] : String(stubDoc.nprov || '00000').padStart(5, '0');
            const numForLog = parseInt(numStr, 10).toString();
            const annoStr = String(stubDoc.anno || 'unknown');

            console.log(`\n  ⬇️  [${localKey}] n.${numForLog}/${annoStr}`);

            await sleep(DELAY_MS);

            // Fetch del documento completo chiedendo questo specifico ID a Solr
            const fullResult = await fetchSingleDocFull(page, annoStr, numStr);
            if (!fullResult) {
                console.error(`    ❌ Impossibile recuperare dettagli per n.${numForLog}/${annoStr}`);
                errors++;
                continue;
            }

            const { doc: fullDoc, highlighting } = fullResult;

            // Estrazione testo (prova vari campi in cui Solr potrebbe mettere il testo)
            let testo = fullDoc.ocr || fullDoc.ocrfull || fullDoc.testo;
            
            // Cerca anche nel blocco highlighting se non c'è nel doc principale
            if ((!testo || testo.length < 200) && highlighting) {
                const hlText = highlighting.ocr || highlighting.ocrfull || highlighting.testo || highlighting.testo_html;
                if (hlText && hlText.length > 0) {
                    testo = hlText.join('\n\n');
                }
            }
            
            if (!testo || testo.length < 200) {
                // Fallback su campo massa o riassunto se il testo pieno non c'è
                if (fullDoc.massa && fullDoc.massa.length > 200) {
                    const rub = fullDoc.rubrica ? `**${fullDoc.rubrica}**\n\n` : '';
                    const ogg = fullDoc.oggetto ? `*${fullDoc.oggetto}*\n\n` : '';
                    testo = rub + ogg + fullDoc.massa;
                    console.log(`    📋 Testo estratto da massima/abstract (${testo.length} chars)`);
                } else {
                    console.warn(`    ⚠️  Testo non disponibile, solo metadati presenti.`);
                    noText++;
                    continue;
                }
            } else {
                console.log(`    📄 Testo OCR completo trovato (${testo.length} chars)`);
            }

            // Cleanup testo
            testo = testo.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/<em class="hit">/g, '').replace(/<\/em>/g, '').trim();

            // Salva su disco
            const outDir = path.join(OUTPUT_DIR, annoStr);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

            const dataPub = fullDoc.dtpub ? fullDoc.dtpub.split('T')[0] : (fullDoc.dtdec ? fullDoc.dtdec.split('T')[0] : '');
            const tipoSez = localKey.startsWith('snpen') ? 'Pen.' : 'Civ.';
            const header = `# [Cass. ${tipoSez}, Sez. Un., ${dataPub}, n. ${numForLog}]\n\n`;
            
            fs.writeFileSync(path.join(outDir, `${localKey}.md`), header + testo, 'utf8');
            localIndex.add(localKey);
            downloaded++;
            console.log(`    ✅ Salvato!`);
        }
    }

    await browser.close();
    console.log(`\n\n${'='.repeat(55)}`);
    console.log(`✨ COMPLETATO!`);
    console.log(`   ✅ Scaricate nuove: ${downloaded}`);
    console.log(`   ⏭️  Skip (già presenti): ${skipped}`);
    console.log(`   ⚠️  Vuote (nessun testo): ${noText}`);
    console.log(`   ❌ Errori XHR: ${errors}`);
    
    if (downloaded > 0) {
        console.log(`\n👉 Ora puoi lanciare: node scripts/rag-ingest-ssuu-v2.js`);
    }
}

main().catch(console.error);
