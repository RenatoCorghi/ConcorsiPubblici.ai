/**
 * SCRAPER BUP (Bologna University Press) — Open Access PDFs
 * Scarica tutti i manuali OA giuridici dal catalogo BUP.
 * 
 * Strategia:
 * 1. Carica il catalogo OA filtrato per area giuridica
 * 2. Estrae i link alle pagine dei singoli libri
 * 3. Per ogni libro, trova il link al PDF OA e lo scarica
 * 
 * Uso:
 *   node scripts/scrape_bup_oa.mjs
 */
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = 'data/manuali_oa/bup';
const INDEX_FILE = path.join(OUTPUT_DIR, '_index.json');
const DELAY_MS = 2000; // Be polite

// Keywords to identify law-related books
const LAW_KEYWORDS = [
    'diritto', 'giuridic', 'processo', 'processual', 'penale', 'civile',
    'amministrativ', 'costituzional', 'lavoro', 'responsabilit', 'contratt',
    'obbligaz', 'procedur', 'giustizia', 'tribunale', 'magistratur', 'codice',
    'sanzione', 'reato', 'illecit', 'tutela', 'giurisdiz', 'arbitrat',
    'espropriaz', 'falliment', 'insolvenz', 'societar', 'fiducia', 'patrimoni',
    'deliber', 'regolament', 'normativ', 'legislat', 'clausole', 'consenso',
    'criminolog', 'vittimolog', 'detenz', 'carcerar', 'punitiv', 'sovranit',
    'federalism', 'sussidiar', 'decentr', 'pubblica amminist', 'enti local',
    'appalto', 'concessione', 'urbanistic', 'edilizia', 'ambiente', 'sanitari',
    'previdenz', 'assistenz', 'contribut', 'tribut', 'fiscal', 'imposta',
    'digital', 'telematic', 'cyber', 'dato', 'privacy', 'telemedicina',
    'seminario giuridic', 'terminus'
];

function isLawRelated(title, collana = '') {
    const text = (title + ' ' + collana).toLowerCase();
    return LAW_KEYWORDS.some(kw => text.includes(kw));
}

async function fetchHTML(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml'
        }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
}

async function downloadPDF(url, filepath) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    // Verify it's actually a PDF
    if (buffer.length < 100 || !buffer.subarray(0, 5).toString().includes('%PDF')) {
        throw new Error('Not a valid PDF');
    }
    fs.writeFileSync(filepath, buffer);
    return buffer.length;
}

// Load or create index
function loadIndex() {
    if (fs.existsSync(INDEX_FILE)) {
        return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    }
    return [];
}

function saveIndex(index) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    let index = loadIndex();
    const alreadyDone = new Set(index.filter(i => i.downloaded).map(i => i.url));

    console.log('📚 BUP Open Access Scraper — Manuali Giuridici');
    console.log(`   Output: ${OUTPUT_DIR}`);
    console.log(`   Già scaricati: ${alreadyDone.size}\n`);

    // Phase 1: Crawl the OA catalog pages
    console.log('🔍 Fase 1: Indicizzazione catalogo OA...');
    
    // BUP catalog uses query params for filtering
    // The main OA catalog URL shows all OA books
    const catalogUrl = 'https://buponline.com/catalogo/?type=tax&t0=is-open-access~1';
    
    let html;
    try {
        html = await fetchHTML(catalogUrl);
    } catch (err) {
        console.error(`❌ Errore caricamento catalogo: ${err.message}`);
        return;
    }

    // Extract book URLs from the catalog page
    // BUP uses links like: https://buponline.com/prodotto/TITLE-SLUG/
    const bookRegex = /href="(https:\/\/buponline\.com\/prodotto\/[^"]+)"/g;
    const bookUrls = new Set();
    let match;
    while ((match = bookRegex.exec(html)) !== null) {
        bookUrls.add(match[1]);
    }

    console.log(`   Trovati ${bookUrls.size} libri OA nel catalogo\n`);

    // Phase 2: Visit each book page and extract PDF link + metadata
    console.log('📥 Fase 2: Estrazione metadati e download PDF...');
    
    let lawBooks = 0;
    let downloaded = 0;
    let errors = 0;
    let skipped = 0;
    let counter = 0;

    for (const bookUrl of bookUrls) {
        counter++;
        
        if (alreadyDone.has(bookUrl)) {
            skipped++;
            continue;
        }

        await new Promise(r => setTimeout(r, DELAY_MS));

        let bookHtml;
        try {
            bookHtml = await fetchHTML(bookUrl);
        } catch (err) {
            console.error(`   ❌ [${counter}] Errore pagina: ${err.message}`);
            errors++;
            continue;
        }

        // Extract title
        const titleMatch = bookHtml.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([^<]+)<\/h1>/i)
            || bookHtml.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim().replace(/\s*[-–|]\s*Bologna University Press.*$/i, '') : path.basename(bookUrl);

        // Extract collana/collection info
        const collanaMatch = bookHtml.match(/Collana[:\s]*([^<]+)/i);
        const collana = collanaMatch ? collanaMatch[1].trim() : '';

        // Check if law-related
        if (!isLawRelated(title, collana)) {
            continue;
        }

        lawBooks++;

        // Look for the OA PDF download link
        // BUP uses links like: buponline.com/?pid=XXX&did=YYY&oaf=1
        const pdfMatch = bookHtml.match(/href="(https:\/\/buponline\.com\/\?pid=\d+&did=[^"]+&oaf=1)"/i)
            || bookHtml.match(/href="([^"]*\.pdf)"/i)
            || bookHtml.match(/href="(https:\/\/buponline\.com\/\?pid=[^"]+oaf[^"]*)"/i);

        if (!pdfMatch) {
            console.log(`   ⚠️  [${counter}] ${title.substring(0, 60)} — No PDF link found`);
            index.push({ url: bookUrl, title, collana, pdfUrl: null, downloaded: false });
            continue;
        }

        const pdfUrl = pdfMatch[1];
        const safeName = title.toLowerCase()
            .replace(/[^a-z0-9àèéìòùç]+/g, '_')
            .substring(0, 80)
            .replace(/_+$/, '') + '.pdf';
        const outputPath = path.join(OUTPUT_DIR, safeName);

        // Skip if already downloaded
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
            index.push({ url: bookUrl, title, collana, pdfUrl, downloaded: true, file: safeName });
            saveIndex(index);
            skipped++;
            continue;
        }

        try {
            const size = await downloadPDF(pdfUrl, outputPath);
            const sizeKB = Math.round(size / 1024);
            console.log(`   ✅ [${counter}] ${title.substring(0, 60)}... (${sizeKB}KB)`);
            index.push({ url: bookUrl, title, collana, pdfUrl, downloaded: true, file: safeName, sizeKB });
            downloaded++;
        } catch (err) {
            console.log(`   ❌ [${counter}] ${title.substring(0, 60)} — ${err.message}`);
            index.push({ url: bookUrl, title, collana, pdfUrl, downloaded: false, error: err.message });
            errors++;
        }

        // Save index periodically
        if (downloaded % 5 === 0) saveIndex(index);
    }

    saveIndex(index);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ BUP OA SCRAPING COMPLETATO`);
    console.log(`   Libri OA totali: ${bookUrls.size}`);
    console.log(`   Libri giuridici: ${lawBooks}`);
    console.log(`   Scaricati: ${downloaded}`);
    console.log(`   Saltati: ${skipped}`);
    console.log(`   Errori: ${errors}`);
}

main();
