/**
 * SCRAPER CORTI TRIBUTARIE v3 — Estrazione testo HTML (no PDF)
 *
 * Scoperta chiave: il testo completo di Massima + Sentenza è disponibile
 * direttamente nella pagina HTML /ricerca/dettaglio/{id} espandendo gli accordion.
 *
 * Strategia: Puppeteer headless:false (bypass Akamai) per la sessione iniziale,
 * poi fetcha ogni pagina di dettaglio, espande gli accordion e ne estrae il testo.
 *
 * Input:  scratch/tributaria_ids_*.json (IDs raccolti dal browser subagent)
 * Output: data/tributario_testi/{id}.md (Markdown con metadati + massima + sentenza)
 *
 * Uso: node scripts/scraper_tributaria_v3.js [--anno=2025] [--start=0]
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://bancadatigiurisprudenza.giustiziatributaria.gov.it';
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'tributario_testi');
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const LOG_FILE = path.join(SCRATCH_DIR, 'tributaria_v3.log');

const args = process.argv.slice(2);
const TARGET_ANNO = args.find(a => a.startsWith('--anno='))?.split('=')[1] || '2025';
const START_FROM = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1] || '0');
const DRY_RUN = args.includes('--dry-run');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(SCRATCH_DIR)) fs.mkdirSync(SCRATCH_DIR, { recursive: true });

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    log('🚀 Scraper Corti Tributarie v3 — Estrazione HTML');
    log(`   Anno: ${TARGET_ANNO} | Start: ${START_FROM} | DryRun: ${DRY_RUN}`);

    // Carica gli ID da file
    const idsFile = path.join(SCRATCH_DIR, `tributaria_ids_${TARGET_ANNO}.json`);
    if (!fs.existsSync(idsFile)) {
        log(`❌ File IDs non trovato: ${idsFile}`);
        log('   Esegui prima il browser subagent per raccogliere gli ID.');
        process.exit(1);
    }

    const allIds = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
    log(`📋 ${allIds.length} ID caricati per anno ${TARGET_ANNO}`);

    if (DRY_RUN) {
        log('[DRY RUN] Uscita senza download.');
        return;
    }

    // Avvia Puppeteer
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,900',
        ]
    });

    try {
        const [page] = await browser.pages();
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );

        // Warmup Akamai
        log('Navigazione homepage (warmup Akamai)...');
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        const title = await page.title();
        log(`Titolo: "${title}"`);
        await humanWarmup(page);

        let processed = 0, skipped = 0, errors = 0;

        for (let i = START_FROM; i < allIds.length; i++) {
            const docId = allIds[i];
            const outFile = path.join(OUTPUT_DIR, `${TARGET_ANNO}_${docId}.md`);

            if (fs.existsSync(outFile)) {
                log(`[${i+1}/${allIds.length}] ⏭️  Già presente: ${docId.substring(0,20)}...`);
                skipped++;
                continue;
            }

            log(`\n─── [${i+1}/${allIds.length}] ${docId} ───`);

            try {
                const result = await extractDocumentText(page, docId);

                if (result) {
                    const md = formatAsMarkdown(result, docId, TARGET_ANNO);
                    fs.writeFileSync(outFile, md, 'utf8');
                    const size = md.length;
                    log(`  ✅ Estratto (${Math.round(size/1024)} KB) → ${path.basename(outFile)}`);
                    processed++;
                } else {
                    log(`  ⚠️ Contenuto vuoto o errore, skip.`);
                    errors++;
                }

            } catch (e) {
                log(`  ❌ Errore: ${e.message.substring(0, 80)}`);
                errors++;
                // Su errore grave, riprendi da homepage
                if (e.message.includes('timeout') || e.message.includes('Session closed')) {
                    log('  Ritorno alla homepage per reset sessione...');
                    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
                        .catch(() => {});
                    await sleep(3000);
                }
            }

            await sleep(1500); // cortesia

            if ((i + 1) % 20 === 0) {
                log(`\n📊 Progresso: ${i+1}/${allIds.length} | ✅ ${processed} | ⏭️ ${skipped} | ❌ ${errors}\n`);
            }
        }

        log(`\n${'═'.repeat(60)}`);
        log(`📊 COMPLETATO: ✅ ${processed} estratti | ⏭️ ${skipped} già presenti | ❌ ${errors} errori`);
        log(`${'═'.repeat(60)}`);

    } finally {
        await browser.close();
    }
}

// ── Estrai il testo da una singola pagina di dettaglio ─────────────────────
async function extractDocumentText(page, docId) {
    const url = `${BASE_URL}/ricerca/dettaglio/${docId}`;

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Aspetta che la pagina carichi i dati principali
    await page.waitForFunction(
        () => document.body.innerText.trim().length > 200,
        { timeout: 15000 }
    ).catch(() => {});
    await sleep(1000);

    // Espandi accordion uno ad uno, aspettando il caricamento AJAX del contenuto
    // IDs confermati dal DOM: #collapse-riepilogo, #collapse-massima, #collapse-sentenza
    const accordionOrder = ['#collapse-riepilogo', '#collapse-massima', '#collapse-sentenza'];
    
    for (const collapseId of accordionOrder) {
        // Trova il button corrispondente (aria-controls = collapseId senza #)
        const btnSelector = `button[aria-controls="${collapseId.substring(1)}"], button[data-bs-target="${collapseId}"]`;
        
        const isAlreadyOpen = await page.evaluate((id) => {
            const el = document.querySelector(id);
            return el ? el.classList.contains('show') : false;
        }, collapseId);

        if (!isAlreadyOpen) {
            const clicked = await page.evaluate((btnSel) => {
                const btn = document.querySelector(btnSel);
                if (btn) { btn.click(); return true; }
                return false;
            }, btnSelector).catch(() => false);

            if (clicked) {
                // Aspetta che il contenuto AJAX venga caricato nel DOM
                try {
                    await page.waitForFunction((id) => {
                        const el = document.querySelector(id + ' .accordion-body');
                        return el && el.innerText.trim().length > 50;
                    }, { timeout: 8000 }, collapseId);
                } catch (e) {
                    // timeout — il contenuto potrebbe non esserci (es. sentenza non massimata)
                }
            }
        }
        await sleep(300);
    }
    await sleep(500);

    // Estrai il contenuto dagli accordion aperti
    const data = await page.evaluate(() => {
        const result = {
            metadati: {},
            massima: '',
            sentenza: '',
            rawText: ''
        };

        // ── Metadati dal riepilogo ────────────────────────────────────────────
        const riepilogo = document.querySelector('#collapse-riepilogo');
        if (riepilogo) {
            const bodyText = riepilogo.innerText;
            
            const dataMatch = bodyText.match(/Data di deposito[:\s]+([0-9/]+)/i);
            if (dataMatch) result.metadati.data = dataMatch[1];
            
            const materiaMatch = bodyText.match(/Materia[:\s]+([^\n]+)/i);
            if (materiaMatch) result.metadati.materia = materiaMatch[1].trim();
            
            const esitoMatch = bodyText.match(/Esito[:\s]+([^\n]+)/i);
            if (esitoMatch) result.metadati.esito = esitoMatch[1].trim();

            const valoreMatch = bodyText.match(/Valore controversia[:\s]+([^\n]+)/i);
            if (valoreMatch) result.metadati.valore = valoreMatch[1].trim();
        }

        // ── Corte e numero dalla testata ──────────────────────────────────────
        const bodyText = document.body.innerText;
        const corteMatch = bodyText.match(/((?:CGT|CTR|CTP|Corte di Giustizia Tributaria)[^\n]*)/i);
        if (corteMatch) result.metadati.corte = corteMatch[1].trim().substring(0, 80);
        
        const numMatch = bodyText.match(/Sentenza n\.\s*(\d+\/\d{4})/i);
        if (numMatch) result.metadati.numero = numMatch[1];

        // ── Massima ───────────────────────────────────────────────────────────
        // Supporta anche Massima n°1, Massima n°2, ecc.
        const massimaEls = document.querySelectorAll('[id^="collapse-massima"] .accordion-body, [id*="massima"] .accordion-body');
        const massimaTexts = [];
        massimaEls.forEach(el => {
            const t = el.innerText.trim();
            if (t.length > 50) massimaTexts.push(t);
        });
        result.massima = massimaTexts.join('\n\n---\n\n');

        // ── Sentenza ──────────────────────────────────────────────────────────
        const sentenzaEl = document.querySelector('#collapse-sentenza .accordion-body');
        if (sentenzaEl) {
            result.sentenza = sentenzaEl.innerText.trim();
        }

        // ── Fallback: testo grezzo se non trovato ────────────────────────────
        if (!result.massima && !result.sentenza) {
            const clone = document.body.cloneNode(true);
            clone.querySelectorAll('nav, header, footer, .navbar, script, style').forEach(el => el.remove());
            result.rawText = clone.innerText;
        }

        return result;
    });

    // Se i selettori non hanno trovato nulla, usa un approccio più aggressivo
    if (!data.massima && !data.sentenza && !data.rawText) {
        // Aspetta ancora un po' e riprova
        await sleep(2000);
        const fullText = await page.evaluate(() => {
            // Prendi TUTTO il testo della pagina, escludendo nav
            const clone = document.body.cloneNode(true);
            ['nav', 'header', 'footer', '.navbar', 'script', 'style'].forEach(sel => {
                clone.querySelectorAll(sel).forEach(el => el.remove());
            });
            return clone.innerText;
        });

        if (fullText.length > 500) {
            data.rawText = fullText;
        } else {
            return null;
        }
    }

    return data;
}

// ── Formatta il risultato in Markdown ─────────────────────────────────────────
function formatAsMarkdown(data, docId, anno) {
    const lines = [];
    
    const corte = data.metadati.corte || 'Corte di Giustizia Tributaria';
    const numero = data.metadati.numero || docId.substring(0, 15);
    const dataStr = data.metadati.data || anno;
    const materia = data.metadati.materia || 'Diritto Tributario';

    lines.push(`# ${corte} — Sentenza n. ${numero}`);
    lines.push('');
    lines.push('## 🧾 Metadati');
    lines.push(`- **Corte**: ${corte}`);
    lines.push(`- **Numero**: ${numero}`);
    lines.push(`- **Data**: ${dataStr}`);
    lines.push(`- **Materia**: ${materia}`);
    lines.push(`- **ID Portale**: ${docId}`);
    lines.push('');

    if (data.massima) {
        lines.push('## Massima Ufficiale');
        lines.push('');
        lines.push(data.massima.substring(0, 5000));
        lines.push('');
    }

    if (data.sentenza) {
        lines.push('## Testo della Sentenza');
        lines.push('');
        lines.push(data.sentenza.substring(0, 50000)); // max 50KB
        lines.push('');
    }

    if (data.rawText && !data.massima && !data.sentenza) {
        lines.push('## Contenuto');
        lines.push('');
        lines.push(data.rawText.substring(0, 50000));
        lines.push('');
    }

    return lines.join('\n');
}

// ── Simulazione comportamento umano ──────────────────────────────────────────
async function humanWarmup(page) {
    log('Simulazione comportamento umano (6s)...');
    for (let i = 0; i < 4; i++) {
        await page.mouse.move(300 + Math.random() * 600, 200 + Math.random() * 400, { steps: 4 });
        await sleep(600 + Math.random() * 500);
    }
    await page.evaluate(() => window.scrollBy(0, 80));
    await sleep(400);
    await page.evaluate(() => window.scrollBy(0, -80));
    log('✅ Warmup completato.\n');
}

main().catch(e => {
    log(`❌ ERRORE FATALE: ${e.message}`);
    process.exit(1);
});
