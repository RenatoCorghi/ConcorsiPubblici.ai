/**
 * SCRAPER: Sistema Penale (sistemapenale.it) — Rivista OA di Diritto Penale
 * 
 * Rivista quotidiana dal 2019. ~313 pagine × ~20 articoli = ~6.000+ contributi
 * Struttura: Landing HTML (metadati/abstract) + PDF (testo completo)
 * 
 * Uso:
 *   node scripts/scrape_sistemapenale.mjs --sample     # Prime 5 pagine
 *   node scripts/scrape_sistemapenale.mjs --full        # Tutto (~313 pagine)
 *   node scripts/scrape_sistemapenale.mjs --from=100    # Da pagina 100
 *   node scripts/scrape_sistemapenale.mjs --download    # Solo download PDF
 */
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const OUTPUT_DIR = path.resolve('data/sistemapenale_articles');
const INDEX_FILE = path.join(OUTPUT_DIR, '_index.json');
const PDF_DIR = path.join(OUTPUT_DIR, 'pdfs');
const BASE_URL = 'https://www.sistemapenale.it';
const DELAY_MS = 1200;

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/pdf',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
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

function decodeEntities(str) {
    return str
        .replace(/&#039;|&#8217;|&#x2019;/g, "'")
        .replace(/&quot;|&#8220;|&#8221;|&#x201C;|&#x201D;/g, '"')
        .replace(/&#8211;|&#x2013;/g, '–')
        .replace(/&#8212;|&#x2014;/g, '—')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

function extractArticleLinksFromListing(html) {
    const articles = [];
    const seen = new Set();

    // Pattern: links to /it/articolo/, /it/sentenza/, /it/scheda/, /it/notizia/
    const linkRegex = /<a[^>]+href="(\/it\/(?:articolo|sentenza|scheda|notizia|documento)\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        const url = BASE_URL + match[1];
        const title = decodeEntities(match[2].trim());
        if (!seen.has(url) && title.length > 5) {
            seen.add(url);
            articles.push({ url, title });
        }
    }

    // Fallback: broader pattern for any href with article-like paths
    const broadRegex = /href="(\/it\/(?:articolo|sentenza|scheda|notizia|documento)\/[^"]+)"/gi;
    while ((match = broadRegex.exec(html)) !== null) {
        const url = BASE_URL + match[1];
        if (!seen.has(url)) {
            seen.add(url);
            articles.push({ url, title: '' });
        }
    }

    return articles;
}

function cleanHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
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
        .replace(/&amp;/g, '&')
        .replace(/&#8217;|&#039;/g, "'")
        .replace(/&#8220;|&#8221;/g, '"')
        .replace(/&#8211;/g, '–')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function scrapeArticlePage(url) {
    const html = await fetchHtml(url);

    // Extract title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<title>([^<]+?)(?:\s*[-|]\s*Sistema Penale)?<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';

    // Extract author(s)
    const authorMatch = html.match(/class="[^"]*autore[^"]*"[^>]*>([^<]+)/i) ||
                       html.match(/class="[^"]*author[^"]*"[^>]*>([^<]+)/i);
    const author = authorMatch ? authorMatch[1].trim() : '';

    // Extract date
    const dateMatch = html.match(/<time[^>]+datetime="([^"]+)"/i) ||
                     html.match(/(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4})/);
    const date = dateMatch ? dateMatch[1] : '';

    // Extract abstract/sommario
    let abstract = '';
    const abstractMatch = html.match(/(?:abstract|sommario|sintesi)[^>]*>([^<]{50,})/i);
    if (abstractMatch) abstract = decodeEntities(abstractMatch[1].trim());

    // Extract PDF link — class "allegati2" or /pdf_contenuti/
    const pdfMatch = html.match(/href="(\/pdf_contenuti\/[^"]+\.pdf)"/i) ||
                    html.match(/href="(\/[^"]*\.pdf)"/i) ||
                    html.match(/class="[^"]*allegati[^"]*"[^>]*href="([^"]+\.pdf)"/i);
    let pdfUrl = pdfMatch ? pdfMatch[1] : null;
    if (pdfUrl && !pdfUrl.startsWith('http')) {
        pdfUrl = BASE_URL + pdfUrl;
    }

    // Extract type (articolo, sentenza, scheda)
    const typeMatch = url.match(/\/it\/(articolo|sentenza|scheda|notizia|documento)\//);
    const type = typeMatch ? typeMatch[1] : 'altro';

    // Extract main content text
    let textContent = '';
    const contentMatch = html.match(/<div[^>]*class="[^"]*(?:field-item|content-body|article-body|node-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (contentMatch) {
        textContent = cleanHtml(contentMatch[1]);
    }
    // Fallback: get article tag
    if (!textContent || textContent.length < 100) {
        const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (articleMatch) textContent = cleanHtml(articleMatch[1]);
    }
    // Fallback: main content
    if (!textContent || textContent.length < 100) {
        const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        if (mainMatch) textContent = cleanHtml(mainMatch[1]);
    }

    return { title, author, date, abstract, pdfUrl, type, textContent };
}

// ===== MAIN =====
const args = process.argv.slice(2);
const SAMPLE = args.includes('--sample');
const DOWNLOAD_ONLY = args.includes('--download');
const FROM = parseInt(args.find(a => a.startsWith('--from='))?.replace('--from=', '') || '0');
const MAX_PAGES = SAMPLE ? 5 : 320;

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(PDF_DIR, { recursive: true });

    let index = [];
    if (fs.existsSync(INDEX_FILE)) {
        index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    }
    const existingUrls = new Set(index.map(a => a.url));

    if (!DOWNLOAD_ONLY) {
        console.log(`🔍 SCRAPER SISTEMA PENALE — Contributi`);
        console.log(`   Modalità: ${SAMPLE ? 'SAMPLE (5 pagine)' : `FULL (da pag. ${FROM})`}`);
        console.log(`   Già indicizzati: ${index.length}\n`);

        let totalNew = 0;
        let emptyPages = 0;

        for (let page = FROM; page <= MAX_PAGES; page++) {
            const listUrl = `${BASE_URL}/it/contributi?page=${page}`;

            try {
                console.log(`\n📄 Pagina ${page}`);
                const html = await fetchHtml(listUrl);
                const links = extractArticleLinksFromListing(html);
                console.log(`   → ${links.length} contributi trovati`);

                if (links.length === 0) {
                    emptyPages++;
                    if (emptyPages >= 3) {
                        console.log(`   📍 3 pagine vuote, fine.`);
                        break;
                    }
                    continue;
                }
                emptyPages = 0;

                for (const link of links) {
                    if (existingUrls.has(link.url)) continue;

                    await new Promise(r => setTimeout(r, DELAY_MS));
                    const shortTitle = (link.title || link.url.split('/').pop()).substring(0, 55);
                    process.stdout.write(`   ⏳ ${shortTitle}...`);

                    try {
                        const meta = await scrapeArticlePage(link.url);
                        const entry = {
                            url: link.url,
                            title: meta.title || link.title,
                            author: meta.author,
                            date: meta.date,
                            type: meta.type,
                            pdfUrl: meta.pdfUrl,
                            hasText: meta.textContent.length > 300,
                            downloaded: false,
                        };

                        // Save text content
                        if (meta.textContent.length > 200) {
                            const slug = link.url.split('/').pop().substring(0, 80);
                            const txtFile = path.join(OUTPUT_DIR, `${slug}.txt`);
                            fs.writeFileSync(txtFile, 
                                `TITOLO: ${entry.title}\nAUTORE: ${entry.author}\nDATA: ${entry.date}\nTIPO: ${entry.type}\nURL: ${entry.url}\n\n---\n\n${meta.textContent}`,
                                'utf8');
                            entry.file = `${slug}.txt`;
                            entry.downloaded = true;
                        }

                        index.push(entry);
                        existingUrls.add(link.url);
                        totalNew++;

                        const status = meta.pdfUrl ? 'PDF' : meta.textContent.length > 300 ? 'HTML' : 'META';
                        console.log(` ✅ ${status} [${meta.type}]`);
                    } catch (err) {
                        console.log(` ❌ ${err.message.substring(0, 40)}`);
                    }
                }

                // Save index periodically
                fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
                await new Promise(r => setTimeout(r, DELAY_MS));

            } catch (err) {
                console.error(`   ❌ Pagina ${page}: ${err.message}`);
                if (err.message.includes('404')) break;
                if (err.message.includes('429') || err.message.includes('403')) {
                    console.log('   ⏳ Rate limited, attesa 60s...');
                    await new Promise(r => setTimeout(r, 60000));
                    page--;
                }
            }
        }

        fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
        console.log(`\n📊 Nuovi: ${totalNew} | Totale indice: ${index.length}`);
    }

    // ===== PDF DOWNLOAD =====
    if (DOWNLOAD_ONLY || !SAMPLE) {
        const toDownload = index.filter(a => a.pdfUrl && !a.pdfDownloaded);
        if (toDownload.length > 0) {
            console.log(`\n📥 Download ${toDownload.length} PDF...\n`);
            let ok = 0, err = 0;

            for (const entry of toDownload) {
                const pdfName = entry.pdfUrl.split('/').pop();
                const outPath = path.join(PDF_DIR, pdfName);

                if (fs.existsSync(outPath)) {
                    entry.pdfDownloaded = true;
                    entry.pdfFile = pdfName;
                    ok++;
                    continue;
                }

                await new Promise(r => setTimeout(r, DELAY_MS));
                process.stdout.write(`   📥 ${pdfName.substring(0, 50)}...`);

                try {
                    const size = await downloadPdf(entry.pdfUrl, outPath);
                    entry.pdfDownloaded = true;
                    entry.pdfFile = pdfName;
                    ok++;
                    console.log(` ✅ ${Math.round(size / 1024)}KB`);
                } catch (e) {
                    err++;
                    console.log(` ❌ ${e.message}`);
                }
            }

            fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
            console.log(`\n📊 PDF: ${ok} OK, ${err} errori`);
        }
    }

    // Stats
    const types = {};
    index.forEach(a => { types[a.type] = (types[a.type] || 0) + 1; });
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ SISTEMA PENALE — TOTALE: ${index.length} contributi`);
    console.log(`   Tipi: ${Object.entries(types).map(([k,v]) => `${k}:${v}`).join(' | ')}`);
    console.log(`   Con PDF: ${index.filter(a=>a.pdfUrl).length}`);
    console.log(`   Con testo: ${index.filter(a=>a.hasText).length}`);
}

main();
