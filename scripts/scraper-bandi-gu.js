#!/usr/bin/env node
/* ============================================================
   SCRAPER-BANDI-GU.JS — Scraper Bandi dalla Gazzetta Ufficiale
   
   Scarica i bandi pubblicati nella 4ª Serie Speciale (Concorsi ed Esami)
   e li salva su Supabase.
   
   Fonti (in ordine di priorità):
   1. RSS Feed GU Serie Concorsi
   2. Archivio ultimi 30 giorni GU
   3. InPA (fallback)
   
   Uso: node scripts/scraper-bandi-gu.js [--limit=100]
   ============================================================ */

import { createClient } from '@supabase/supabase-js';
import { JSDOM } from 'jsdom';

// --- CONFIG ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY non trovata. Imposta la variabile d\'ambiente.');
    console.error('   set SUPABASE_SERVICE_KEY=eyJ...');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '500');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
};

// Proxy pubblico per superare eventuali blocchi IP/WAF della GU
const PROXY_BASE = 'https://api.allorigins.win/raw?url=';

const DELAY_MS = 2000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- CONTATORI ---
let stats = { inseriti: 0, duplicati: 0, errori: 0, totale: 0 };

// ============================================================
// STRATEGIA 1: RSS Feed (TiConsiglio.com / Concorsi Pubblici)
// Fonte molto più affidabile della GU, non blocca i bot.
// ============================================================
async function fetchFromRSS() {
    console.log('\n📡 Strategia 1: RSS Feed Alternativo (TiConsiglio) - Bulk Pagination...');
    let bandi = [];
    
    // Scarichiamo fino a 15 pagine (circa 450 bandi, coprendo ben oltre 6 mesi)
    for (let page = 1; page <= 15; page++) {
        if (bandi.length >= LIMIT) break;
        
        const RSS_URL = `https://www.ticonsiglio.com/concorsi-pubblici/feed/?paged=${page}`;
        console.log(`   📄 Lettura Pagina RSS ${page}...`);

        try {
            const res = await fetch(RSS_URL, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
            if (!res.ok) {
                console.log(`   ⚠️ Fine delle pagine o errore HTTP ${res.status}`);
                break;
            }
            const xml = await res.text();
            
            if (!xml.includes('<item>')) {
                console.log('   ⚠️ Nessun altro bando trovato in questa pagina.');
                break;
            }

            const dom = new JSDOM(xml, { contentType: 'text/xml' });
            const items = dom.window.document.querySelectorAll('item');
            console.log(`   ✅ Trovati ${items.length} items`);

        items.forEach(item => {
            const title = item.querySelector('title')?.textContent?.trim() || '';
            const link = item.querySelector('link')?.textContent?.trim() || '';
            const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
            const content = item.querySelector('description')?.textContent?.trim() || '';

            if (title && link) {
                // Genera un ID univoco dal link per evitare duplicati
                const codice = link.split('/').filter(Boolean).pop() || `rss-${Date.now()}`;
                
                const dataPub = pubDate ? new Date(pubDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

                const { ente, posti, categoria } = parseTitolo(title);
                const scadenza = estraiScadenza(title + ' ' + content);

                bandi.push({
                    codice_redazionale: 'TC-' + codice.substring(0, 30).toUpperCase(),
                    titolo: title.substring(0, 500),
                    ente: ente,
                    categoria: categoria,
                    tipo: title.toLowerCase().includes('avviso') ? 'AVVISO' : 'CONCORSO',
                    data_pubblicazione: dataPub,
                    numero_gazzetta: null,
                    scadenza: scadenza,
                    url_gazzetta: link,
                    posti: posti
                });
            }
        });

        } catch (e) {
            console.log(`   ❌ Pagina fallita: ${e.message}`);
            break; // Se fallisce una pagina, fermiamo il loop RSS
        }
        
        await sleep(1000); // Pausa tra le richieste per educazione
    }

    return bandi;
}

// ============================================================
// STRATEGIA 2: Scraping pagina sommario GU
// ============================================================
async function fetchFromSommario() {
    console.log('\n📰 Strategia 2: Scraping Sommario GU ultimi 30 giorni...');
    const bandi = [];
    
    // Genera le date degli ultimi 30 giorni (solo martedì e venerdì = giorni di pubblicazione GU Concorsi)
    const oggi = new Date();
    const dateToCheck = [];
    for (let i = 0; i < 30; i++) {
        const d = new Date(oggi);
        d.setDate(d.getDate() - i);
        const dayOfWeek = d.getDay();
        // La Serie Concorsi esce il martedì (2) e il venerdì (5)
        if (dayOfWeek === 2 || dayOfWeek === 5) {
            dateToCheck.push(d.toISOString().split('T')[0]);
        }
    }
    
    console.log(`   📅 Date da controllare: ${dateToCheck.length} (mar/ven degli ultimi 30gg)`);

    for (const dataStr of dateToCheck) {
        if (bandi.length >= LIMIT) break;
        
        const baseUrl = `https://www.gazzettaufficiale.it/gazzetta/concorsi/caricaDettaglio?dataPubblicazioneGazzetta=${dataStr}&numeroGazzetta=`;
        const url = PROXY_BASE + encodeURIComponent(baseUrl);
        try {
            const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
            if (!res.ok) {
                console.log(`   ⚠️ ${dataStr}: HTTP ${res.status}`);
                continue;
            }
            const html = await res.text();
            
            if (html.includes('Request Rejected') || html.includes('Access Denied') || html.length < 500) {
                console.log(`   🚫 ${dataStr}: Bloccato dal WAF`);
                continue;
            }
            
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            
            // Cerca i link ai singoli atti
            const links = doc.querySelectorAll('a[href*="caricaDettaglioAtto"]');
            console.log(`   📄 ${dataStr}: Trovati ${links.length} bandi`);
            
            links.forEach(link => {
                const href = link.getAttribute('href') || '';
                const titleText = link.textContent?.trim() || '';
                
                const codiceMatch = href.match(/codiceRedazionale=([A-Z0-9]+)/);
                const codice = codiceMatch ? codiceMatch[1] : null;
                if (!codice || !titleText) return;
                
                const { ente, posti, categoria } = parseTitolo(titleText);
                const scadenza = estraiScadenza(titleText);
                
                bandi.push({
                    codice_redazionale: codice,
                    titolo: titleText.substring(0, 500),
                    ente: ente,
                    categoria: categoria,
                    tipo: titleText.toLowerCase().includes('avviso') ? 'AVVISO' : 'CONCORSO',
                    data_pubblicazione: dataStr,
                    numero_gazzetta: null,
                    scadenza: scadenza,
                    url_gazzetta: `https://www.gazzettaufficiale.it${href}`,
                    posti: posti
                });
            });
            
            await sleep(DELAY_MS);
        } catch (e) {
            console.log(`   ❌ ${dataStr}: ${e.message}`);
        }
    }
    
    return bandi;
}

// ============================================================
// STRATEGIA 3: InPA (Fallback)
// ============================================================
async function fetchFromInPA() {
    console.log('\n🏛️  Strategia 3: InPA (Portale del Reclutamento)...');
    const bandi = [];
    
    // InPA ha un'interfaccia web con listing dei bandi
    // Proviamo a caricare la pagina principale dei bandi
    const url = 'https://www.inpa.gov.it/bandi-e-avvisi/';
    
    try {
        const res = await fetch(url, { 
            headers: { ...HEADERS, 'Accept': 'text/html' },
            signal: AbortSignal.timeout(20000) 
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        
        if (html.length < 1000 || html.includes('Access Denied')) {
            console.log('   ⚠️ InPA: Bloccato o pagina vuota');
            return [];
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // InPA usa card con i bandi
        const cards = doc.querySelectorAll('[class*="card"], [class*="bando"], article, .list-item');
        console.log(`   📋 InPA: Trovati ${cards.length} elementi`);
        
        cards.forEach(card => {
            const titleEl = card.querySelector('h2, h3, h4, [class*="title"], a');
            const title = titleEl?.textContent?.trim();
            if (!title || title.length < 10) return;
            
            const linkEl = card.querySelector('a[href]');
            const link = linkEl?.getAttribute('href') || '';
            
            const enteEl = card.querySelector('[class*="ente"], [class*="publisher"], small');
            const ente = enteEl?.textContent?.trim() || '';
            
            const codice = `inpa-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const { posti, categoria } = parseTitolo(title);
            const scadenza = estraiScadenza(card.textContent || '');
            
            bandi.push({
                codice_redazionale: codice,
                titolo: title.substring(0, 500),
                ente: ente || null,
                categoria: categoria,
                tipo: title.toLowerCase().includes('avviso') ? 'AVVISO' : 'CONCORSO',
                data_pubblicazione: new Date().toISOString().split('T')[0],
                numero_gazzetta: null,
                scadenza: scadenza,
                url_gazzetta: link.startsWith('http') ? link : `https://www.inpa.gov.it${link}`,
                posti: posti
            });
        });
        
        return bandi;
    } catch (e) {
        console.log(`   ❌ InPA fallito: ${e.message}`);
        return [];
    }
}

// ============================================================
// HELPERS
// ============================================================

function parseTitolo(titolo) {
    const lower = titolo.toLowerCase();
    let ente = null;
    let posti = null;
    let categoria = 'Altro';
    
    // Estrai numero posti
    const postiMatch = titolo.match(/(\d+)\s*post[oi]/i) || titolo.match(/n\.\s*(\d+)\s*post/i);
    if (postiMatch) posti = parseInt(postiMatch[1]);
    
    // Estrai ente (dopo trattino o "presso")
    const enteMatch = titolo.match(/(?:presso|[-–—])\s*(.+?)(?:\s*[-–—]|\s*\.|\s*$)/i);
    if (enteMatch) ente = enteMatch[1].trim().substring(0, 200);
    
    // Categorizza
    if (lower.includes('universit')) categoria = 'Università';
    else if (lower.includes('comune') || lower.includes('municipal')) categoria = 'Enti Locali';
    else if (lower.includes('ministero') || lower.includes('dipartimento')) categoria = 'Amministrazioni Centrali';
    else if (lower.includes('asl') || lower.includes('ospedale') || lower.includes('sanit') || lower.includes('irccs')) categoria = 'Sanità';
    else if (lower.includes('regione') || lower.includes('regional')) categoria = 'Regioni';
    else if (lower.includes('ricerca') || lower.includes('cnr') || lower.includes('enea') || lower.includes('infn')) categoria = 'Enti di Ricerca';
    else if (lower.includes('militare') || lower.includes('carabinieri') || lower.includes('polizia') || lower.includes('finanza') || lower.includes('esercito')) categoria = 'Forze Armate e Polizia';
    else if (lower.includes('scuola') || lower.includes('docent') || lower.includes('istruzione')) categoria = 'Istruzione';
    else if (lower.includes('giustizia') || lower.includes('magistrat') || lower.includes('notari')) categoria = 'Giustizia';
    else if (lower.includes('agenzia') || lower.includes('entrate') || lower.includes('dogane')) categoria = 'Agenzie Fiscali';
    
    return { ente, posti, categoria };
}

function estraiScadenza(testo) {
    if (!testo) return null;
    
    // Pattern: "entro il DD/MM/YYYY", "scadenza DD/MM/YYYY", "termine: DD-MM-YYYY"
    const patterns = [
        /scadenz[ae]\s*[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
        /entro\s+(?:il\s+)?(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
        /termine\s*[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*(?:scadenza|termine)/i,
        // Pattern "trenta giorni", "trentesimo giorno" dal giorno di pubblicazione
        /(?:trenta|30)\s*giorni/i
    ];
    
    for (const p of patterns) {
        const m = testo.match(p);
        if (m && m[3]) {
            const day = parseInt(m[1]);
            const month = parseInt(m[2]);
            const year = parseInt(m[3]);
            if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024) {
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
    }
    
    // Se contiene "trenta giorni" e non abbiamo trovato una data specifica, stima 30gg da oggi
    if (/(?:trenta|30)\s*giorni/i.test(testo)) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
    }
    
    return null;
}

// ============================================================
// SALVA SU SUPABASE
// ============================================================
async function saveBandi(bandi) {
    console.log(`\n💾 Salvataggio ${bandi.length} bandi su Supabase...`);
    
    for (const bando of bandi) {
        try {
            const { error } = await supabase
                .from('bandi_concorsi')
                .upsert(bando, { onConflict: 'codice_redazionale' });
            
            if (error) {
                if (error.code === '23505') { // Duplicate
                    stats.duplicati++;
                } else {
                    console.log(`   ❌ Errore: ${error.message}`);
                    stats.errori++;
                }
            } else {
                stats.inseriti++;
            }
            stats.totale++;
        } catch (e) {
            stats.errori++;
            stats.totale++;
        }
    }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  📢  SCRAPER BANDI — Gazzetta Ufficiale');
    console.log('  📅  ' + new Date().toLocaleString('it-IT'));
    console.log('  🔢  Limite: ' + LIMIT + ' bandi');
    console.log('═══════════════════════════════════════════════════');
    
    let allBandi = [];
    
    // Strategia 1: RSS
    const rssBandi = await fetchFromRSS();
    allBandi = allBandi.concat(rssBandi);
    
    // Strategia 2: Sommario (se RSS ha dato pochi risultati)
    if (allBandi.length < 10) {
        const sommarioBandi = await fetchFromSommario();
        allBandi = allBandi.concat(sommarioBandi);
    }
    
    // Strategia 3: InPA (fallback se tutto il resto fallisce)
    if (allBandi.length < 5) {
        const inpaBandi = await fetchFromInPA();
        allBandi = allBandi.concat(inpaBandi);
    }
    
    // Deduplica per codice_redazionale
    const seen = new Set();
    allBandi = allBandi.filter(b => {
        if (seen.has(b.codice_redazionale)) return false;
        seen.add(b.codice_redazionale);
        return true;
    });
    
    // Limita
    allBandi = allBandi.slice(0, LIMIT);
    
    console.log(`\n📊 Totale bandi trovati (dedup): ${allBandi.length}`);
    
    if (allBandi.length > 0) {
        await saveBandi(allBandi);
    }
    
    // Report
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  📊  REPORT FINALE');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  ✅ Inseriti:   ${stats.inseriti}`);
    console.log(`  🔄 Duplicati:  ${stats.duplicati}`);
    console.log(`  ❌ Errori:     ${stats.errori}`);
    console.log(`  📦 Totale:     ${stats.totale}`);
    console.log('═══════════════════════════════════════════════════');
}

main().catch(e => {
    console.error('💥 Errore fatale:', e);
    process.exit(1);
});
