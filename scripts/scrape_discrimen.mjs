/**
 * SCRAPER: Discrimen.it — Download PDF e Indicizzazione
 * 
 * Fase 1: Scrappa le pagine listing per raccogliere URL articoli e link PDF
 * Fase 2: Scarica i PDF nella directory data/discrimen_pdfs/
 * 
 * Uso:
 *   node scripts/scrape_discrimen.mjs --sample       # Prime 3 pagine listing
 *   node scripts/scrape_discrimen.mjs --full          # Tutto
 *   node scripts/scrape_discrimen.mjs --from=50       # Da pagina 50
 *   node scripts/scrape_discrimen.mjs --download-only # Solo download PDF dall'indice esistente
 *   node scripts/scrape_discrimen.mjs --novita        # Scrappa /novita/ (contenuti recenti)
 */
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const OUTPUT_DIR = path.resolve('data/discrimen_pdfs');
const INDEX_FILE = path.join(OUTPUT_DIR, '_index.json');
const BASE_URL = 'https://discrimen.it';
const DELAY_MS = 1500;

const HEADERS = {
    'User-Agent': 'ConcorsiAI-Research-Bot/1.0 (academic research)',
    'Accept': 'text/html,application/xhtml+xml,application/pdf',
};

async function fetchHtml(url) {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.text();
}

async function downloadPdf(url, outputPath) {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const fileStream = fs.createWriteStream(outputPath);
    await pipeline(Readable.fromWeb(response.body), fileStream);
    return fs.statSync(outputPath).size;
}

function extractArticleLinksFromListing(html) {
    const articles = [];
    const seen = new Set();

    // Pattern: "Leggi tutto" links (WordPress readmore)
    const readmoreRegex = /href="(https:\/\/discrimen\.it\/[a-z0-9\-]+(?:\/[a-z0-9\-]+)*\/?)"\s*[^>]*>\s*(?:Leggi tutto|Leggi)/gi;
    let match;
    while ((match = readmoreRegex.exec(html)) !== null) {
        const url = match[1].replace(/\/$/, '');
        if (!seen.has(url) && !isNavUrl(url)) {
            seen.add(url);
            articles.push({ url });
        }
    }

    // Pattern: heading links <h3 class="..."><a href="...">TITLE</a>
    const h3Regex = /<h3[^>]*>\s*(?:<a[^>]*>)?\s*<a[^>]+href="(https:\/\/discrimen\.it\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    while ((match = h3Regex.exec(html)) !== null) {
        const url = match[1].replace(/\/$/, '');
        const title = decodeEntities(match[2].trim());
        if (!seen.has(url) && !isNavUrl(url)) {
            seen.add(url);
            articles.push({ url, title });
        }
        // Enrich existing
        const existing = articles.find(a => a.url === url && !a.title);
        if (existing && title) existing.title = title;
    }

    return articles;
}

function isNavUrl(url) {
    const skipPaths = ['/pubblicazioni/page/', '/libri/page/', '/riviste', '/discrimen/',
        '/criminalia/', '/ipertesti/', '/videos', '/novita/', '/eventi/',
        '/indice/', '/contatti', '/accedi', '/organizzazione', '/informativa',
        '/termini', '/wp-content/', '/categoria/', '/area-tematica/'];
    return skipPaths.some(p => url.includes(p));
}

function decodeEntities(str) {
    return str.replace(/&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"')
              .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
              .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function scrapeArticlePage(url) {
    const html = await fetchHtml(url);
    
    // Extract PDF link
    const pdfMatch = html.match(/href="(https:\/\/discrimen\.it\/wp-content\/uploads\/[^"]+\.pdf)"/i);
    const pdfUrl = pdfMatch ? pdfMatch[1] : null;

    // Extract title from <h1> or <title>
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<title>([^<]+)\s*–\s*Discrimen/i);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';

    // Extract author
    const authorMatch = html.match(/<(?:span|p|div)[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)/i);
    const author = authorMatch ? authorMatch[1].trim() : '';

    // Extract date
    const dateMatch = html.match(/<time[^>]+datetime="([^"]+)"/i) ||
                     html.match(/(\d{1,2}\s+\w+\s+\d{4})/);
    const date = dateMatch ? dateMatch[1] : '';

    // Extract category/area tematica
    const catMatch = html.match(/area-tematica\/([^"\/]+)/i);
    const category = catMatch ? catMatch[1].replace(/-/g, ' ') : '';

    // Extract text content — many articles have substantial inline text
    let textContent = '';
    // Try entry-content first
    const entryMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<(?:\/article|div|footer|section)/i);
    if (entryMatch) {
        textContent = entryMatch[1];
    }
    // Try article body
    if (!textContent || textContent.length < 200) {
        const articleBody = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (articleBody) textContent = articleBody[1];
    }
    // Try the main content area between content markers
    if (!textContent || textContent.length < 200) {
        const mainContent = html.match(/id="content"[^>]*>([\s\S]*?)<(?:footer|aside)/i);
        if (mainContent) textContent = mainContent[1];
    }
    // Clean HTML to readable text
    textContent = textContent
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<h[1-6][^>]*>/gi, '\n### ')
        .replace(/<li>/gi, '\n- ')
        .replace(/<\/li>/gi, '')
        .replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**')
        .replace(/<em>/gi, '*').replace(/<\/em>/gi, '*')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#8217;|&#x2019;/g, "'").replace(/&#8220;|&#x201C;|&#8221;|&#x201D;/g, '"')
        .replace(/&#8211;|&#x2013;/g, '–').replace(/&#8212;|&#x2014;/g, '—')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return { title, author, date, category, pdfUrl, textContent };
}

// ===== MAIN =====
const args = process.argv.slice(2);
const SAMPLE = args.includes('--sample');
const DOWNLOAD_ONLY = args.includes('--download-only');
const NOVITA = args.includes('--novita');
const FROM = parseInt(args.find(a => a.startsWith('--from='))?.replace('--from=', '') || '1');
const MAX_PAGES = SAMPLE ? 3 : 200;

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Load or create index
    let index = [];
    if (fs.existsSync(INDEX_FILE)) {
        index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    }

    if (!DOWNLOAD_ONLY) {
        // ===== PHASE 1: INDEXING =====
        const sections = NOVITA 
            ? [{ base: `${BASE_URL}/novita`, name: 'Novità' }]
            : [{ base: `${BASE_URL}/pubblicazioni`, name: 'Pubblicazioni' }];
        
        console.log(`🔍 FASE 1: Indicizzazione articoli Discrimen.it`);
        console.log(`   Sezione: ${sections[0].name}`);
        console.log(`   Modalità: ${SAMPLE ? 'SAMPLE (3 pagine)' : `FULL (da pag. ${FROM})`}`);
        console.log(`   Già indicizzati: ${index.length}\n`);

        const existingUrls = new Set(index.map(a => a.url));
        let totalNew = 0;

        for (const section of sections) {
        for (let page = FROM; page <= MAX_PAGES; page++) {
            const listUrl = page === 1
                ? `${section.base}/`
                : `${section.base}/page/${page}/`;

            try {
                console.log(`📄 Pagina ${page}`);
                const html = await fetchHtml(listUrl);
                const links = extractArticleLinksFromListing(html);
                console.log(`   → ${links.length} link trovati`);

                if (links.length === 0) {
                    console.log(`   📍 Nessun link, fine.`);
                    break;
                }

                for (const link of links) {
                    if (existingUrls.has(link.url)) continue;

                    await new Promise(r => setTimeout(r, DELAY_MS));
                    process.stdout.write(`   ⏳ ${(link.title || link.url).substring(0, 55)}...`);

                    try {
                        const meta = await scrapeArticlePage(link.url);
                        const entry = {
                            url: link.url,
                            title: meta.title || link.title || '',
                            author: meta.author,
                            date: meta.date,
                            category: meta.category,
                            pdfUrl: meta.pdfUrl,
                            hasText: meta.textContent.length > 300,
                            downloaded: false,
                        };

                        // Save text content if substantial (both PDF and HTML articles)
                        if (meta.textContent.length > 300) {
                            const slug = link.url.replace(BASE_URL + '/', '').replace(/\//g, '');
                            const txtFile = path.join(OUTPUT_DIR, `${slug.substring(0, 80)}.txt`);
                            fs.writeFileSync(txtFile, `TITOLO: ${entry.title}\nAUTORE: ${entry.author}\nDATA: ${entry.date}\nCATEGORIA: ${entry.category}\nURL: ${entry.url}\n\n---\n\n${meta.textContent}`, 'utf8');
                            entry.file = path.basename(txtFile);
                            entry.downloaded = true;
                            entry.hasText = true;
                        }

                        index.push(entry);
                        existingUrls.add(link.url);
                        totalNew++;
                        console.log(` ✅ ${meta.pdfUrl ? 'PDF' : meta.textContent.length > 300 ? 'HTML' : 'NO-CONTENT'}`);
                    } catch (err) {
                        console.log(` ❌ ${err.message}`);
                    }
                }

                // Save index after each page
                fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');

                if (!html.includes(`/page/${page + 1}/`)) {
                    console.log(`\n📍 Ultima pagina.`);
                    break;
                }
                await new Promise(r => setTimeout(r, DELAY_MS));
            } catch (err) {
                console.error(`   ❌ ${err.message}`);
                if (err.message.includes('404')) break;
                if (err.message.includes('429')) {
                    await new Promise(r => setTimeout(r, 30000));
                    page--;
                }
            }
        }
        } // end sections loop
        console.log(`\n📊 Indicizzati ${totalNew} nuovi articoli (totale: ${index.length})\n`);
    }

    // ===== PHASE 2: PDF DOWNLOAD =====
    const toDownload = index.filter(a => a.pdfUrl && !a.downloaded);
    if (toDownload.length > 0) {
        console.log(`📥 FASE 2: Download ${toDownload.length} PDF\n`);

        let downloaded = 0;
        let errors = 0;

        for (const entry of toDownload) {
            const pdfName = entry.pdfUrl.split('/').pop();
            const outPath = path.join(OUTPUT_DIR, pdfName);

            if (fs.existsSync(outPath)) {
                entry.downloaded = true;
                entry.file = pdfName;
                downloaded++;
                continue;
            }

            await new Promise(r => setTimeout(r, DELAY_MS));
            process.stdout.write(`   📥 ${pdfName.substring(0, 50)}...`);

            try {
                const size = await downloadPdf(entry.pdfUrl, outPath);
                entry.downloaded = true;
                entry.file = pdfName;
                downloaded++;
                console.log(` ✅ ${Math.round(size / 1024)}KB`);
            } catch (err) {
                errors++;
                console.log(` ❌ ${err.message}`);
            }
        }

        // Update index
        fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');

        console.log(`\n📊 Download: ${downloaded} OK, ${errors} errori`);
    } else {
        console.log(`📊 Nessun PDF da scaricare.`);
    }

    // Stats
    const withPdf = index.filter(a => a.pdfUrl).length;
    const withText = index.filter(a => a.hasText).length;
    const dled = index.filter(a => a.downloaded).length;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ TOTALE INDICE: ${index.length} articoli`);
    console.log(`   Con PDF: ${withPdf} | Con testo HTML: ${withText}`);
    console.log(`   Scaricati: ${dled}`);
}

main();
