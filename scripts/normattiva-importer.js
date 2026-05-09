import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { readFileSync } from 'fs';

// ==========================================
// CONFIGURAZIONE — Legge le chiavi da .env
// ==========================================
// Mini dotenv loader
const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 1. SCARICA L'HTML DA NORMATTIVA
// ==========================================
async function fetchNormattivaHtml(url) {
    console.log(`🌐 Tentativo di accesso a Normattiva: ${url}...`);
    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            redirect: 'follow'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (text.length < 500) throw new Error("Pagina troppo corta (probabile blocco anti-bot)");
        return text;
    } catch (e) {
        console.error("❌ Errore fetch Normattiva:", e.message);
        console.log("💡 Suggerimento: Se il sito continua a bloccarci, prova ad aprire l'URL nel browser e salvare la pagina come 'legge.html' nella cartella del progetto.");
        return null;
    }
}

// ==========================================
// 2. ESTRAZIONE ARTICOLI (PARSING LOCALE VELOCISSIMO)
// Approccio: split per heading, poi estrazione testo per blocco
// ==========================================
function extractArticlesLocally(html) {
    console.log("⚙️ Estrazione articoli in locale (Zero AI, Massima velocità)...");

    let titolo_atto = "Legge Sconosciuta";
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) titolo_atto = titleMatch[1].replace(/<[^>]*>/g, '').trim();

    const articoli = [];

    // Step 1: Trova tutte le posizioni degli heading di articolo (h2/h3 o attachment-name)
    const headingRegex = /<(?:h2|h3)[^>]*class="article-num-akn"[^>]*>([\s\S]*?)<\/(?:h2|h3)>|<div[^>]*class="attachment-name"[^>]*>([\s\S]*?)<\/div>/gi;
    const headings = [];
    let hMatch;

    while ((hMatch = headingRegex.exec(html)) !== null) {
        const rawNum = (hMatch[1] || hMatch[2] || "").replace(/<[^>]*>/g, '').trim();
        const numMatch = rawNum.match(/art(?:icolo|\.)?\s*([\d\w\-]+)/i);
        headings.push({
            numero: numMatch ? numMatch[1] : rawNum,
            startIndex: hMatch.index,
            endOfHeading: hMatch.index + hMatch[0].length
        });
    }

    if (headings.length === 0) {
        return { titolo_atto, articoli };
    }

    // Step 2: Per ogni heading, estrai il blocco fino al prossimo heading
    for (let i = 0; i < headings.length; i++) {
        const h = headings[i];
        const nextStart = i + 1 < headings.length ? headings[i + 1].startIndex : html.length;
        const blocco = html.slice(h.endOfHeading, nextStart);

        // Estrai rubrica
        const rubrMatch = blocco.match(/<div[^>]*class="article-heading-akn"[^>]*>([\s\S]*?)<\/div>/i);
        const titolo = rubrMatch ? rubrMatch[1].replace(/<[^>]*>/g, '').trim() : "";

        // Estrai testo pulito
        const testo = blocco
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é')
            .replace(/&agrave;/g, 'à').replace(/&ugrave;/g, 'ù')
            .replace(/&igrave;/g, 'ì').replace(/&ograve;/g, 'ò')
            .replace(/&deg;/g, '°')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        if (!testo || testo.length < 10) continue;

        articoli.push({ numero: h.numero, titolo, testo });
    }

    return { titolo_atto, articoli };
}

// ==========================================
// 3. GENERAZIONE DOTTRINA (IL NOSTRO "LISIA")
// ==========================================
async function generaDottrina(articolo, titoloAtto) {
    let tentativi = 0;
    const maxTentativi = 15;
    let attesaBase = 10000; // 10 secondi iniziali

    while (tentativi < maxTentativi) {
        tentativi++;
        if (tentativi > 1) console.log(`🔄 Tentativo ${tentativi}/${maxTentativi} per Art. ${articolo.numero}...`);

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`;
            
            const promptSistema = `Sei Lisia, esperto giurista. Scrivi un commento dottrinale di alto livello per un manuale di preparazione ai concorsi superiori.
Usa come base il testo di legge fornito.
Struttura in Markdown:
# Art. ${articolo.numero} - ${articolo.titolo || titoloAtto}
## Inquadramento e Ratio
## Commento Analitico
## Riferimenti Giurisprudenziali (Cassazione/CdS)`;

            const promptUser = `Atto: ${titoloAtto}\nArticolo ${articolo.numero}: ${articolo.testo}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: promptSistema }] },
                    contents: [{ role: "user", parts: [{ text: promptUser }] }],
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                })
            });

            const data = await response.json();

            if (response.status === 429) {
                const attesa = attesaBase * tentativi;
                console.warn(`⚠️ Rate Limit (429) per Art. ${articolo.numero}. Attesa ${attesa/1000}s e riprovo...`);
                await new Promise(r => setTimeout(r, attesa));
                continue;
            }

            if (!response.ok || !data.candidates || data.candidates.length === 0) {
                 if (data.error && data.error.message && data.error.message.includes("quota")) {
                    const attesa = 60000; // 1 minuto se quota superata
                    console.warn(`⚠️ Quota superata. Attesa 60s...`);
                    await new Promise(r => setTimeout(r, attesa));
                    continue;
                 }
                 console.error(`❌ Errore API per Art. ${articolo.numero}:`, JSON.stringify(data, null, 2));
                 // Se è un errore di sicurezza o altro non bloccante, aspettiamo un po' e riproviamo comunque
                 await new Promise(r => setTimeout(r, 5000));
                 continue;
            }
            
            return data.candidates[0].content.parts[0].text;
        } catch (e) {
            console.error(`❌ Errore connessione per Art. ${articolo.numero}:`, e.message);
            await new Promise(r => setTimeout(r, 10000));
        }
    }
    
    console.error(`🛑 Falliti tutti i ${maxTentativi} tentativi per Art. ${articolo.numero}. Viene saltato.`);
    return null;
}

// ==========================================
// 4. MAIN EXECUTION
// ==========================================
async function main() {
    const inputPath = process.argv[2]; 
    const materiaArg = process.argv[3] || 'Generale'; // Default a Generale se non specificata
    const cleanLawName = process.argv[4]; // Nome opzionale della legge (es. L. 241/1990)
    
    if (!inputPath) {
        console.log("Uso: node scripts/normattiva-importer.js [URL_o_FILE_LOCALE] [MATERIA] [NOME_LEGGE]");
        console.log("Esempio: node scripts/normattiva-importer.js data/codici/civile.html \"Diritto Civile\" \"Codice Civile\"");
        return;
    }

    let html;
    if (inputPath.startsWith('http')) {
        html = await fetchNormattivaHtml(inputPath);
    } else {
        try {
            console.log(`📂 Caricamento file locale: ${inputPath}...`);
            html = fs.readFileSync(inputPath, 'utf-8');
        } catch (e) {
            console.error("❌ Errore lettura file locale:", e.message);
            return;
        }
    }

    if (!html) return;

    const dataAtto = extractArticlesLocally(html);
    if (!dataAtto || !dataAtto.articoli || dataAtto.articoli.length === 0) {
        console.error("❌ Impossibile estrarre articoli dall'atto. Verifica che il file HTML sia valido.");
        return;
    }

    console.log(`✅ Atto individuato: ${dataAtto.titolo_atto}`);
    console.log(`✅ Materia assegnata: ${materiaArg}`);
    console.log(`✅ Articoli trovati: ${dataAtto.articoli.length}`);

    // === NOVITA': CONTROLLO DUPLICATI (RECUPERO ERRORI) CON PAGINAZIONE ===
    console.log(`\n🔍 Controllo articoli già presenti nel database...`);
    let allRecords = [];
    let from = 0;
    let step = 1000;
    let hasMore = true;
    
    while(hasMore) {
        const { data, error } = await supabase
            .from('dottrina_sintetica')
            .select('istituto')
            .eq('materia', materiaArg)
            .range(from, from + step - 1);
            
        if (error) {
            console.error("❌ Errore lettura duplicati:", error.message);
            break;
        }
        
        if (data && data.length > 0) {
            allRecords = allRecords.concat(data);
            from += step;
            if (data.length < step) hasMore = false; // Ultima pagina
        } else {
            hasMore = false;
        }
    }
        
    const existingSet = new Set();
    allRecords.forEach(r => existingSet.add(r.istituto));
    console.log(`ℹ️ Trovati ${existingSet.size} articoli già salvati per ${materiaArg}.`);

    // Inizia generazione e salvataggio
    for (const art of dataAtto.articoli) {
        const suffix = cleanLawName || dataAtto.titolo_atto;
        const nomeIstituto = `Art. ${art.numero} - ${suffix}`;
        
        // Se esiste già, salta e risparmia token/tempo!
        if (existingSet.has(nomeIstituto)) {
            console.log(`⏩ Skip Art. ${art.numero}: Già presente. (Recupero intelligente)`);
            continue;
        }

        const saggio = await generaDottrina(art, dataAtto.titolo_atto);
        
        if (saggio) {
            const { error } = await supabase.from('dottrina_sintetica').insert([{
                materia: materiaArg,
                istituto: nomeIstituto,
                contenuto_markdown: saggio,
                versione_ai: 'gemini-3.1-flash-lite'
            }]);
            
            if (error) console.error(`❌ Errore salvataggio Art. ${art.numero}:`, error.message);
            else console.log(`✅ Articolo ${art.numero} salvato con successo!`);
        }
        
        // Attesa per evitare rate limit
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log("\n🎉 IMPORTAZIONE COMPLETATA CON SUCCESSO!");
}

main();
