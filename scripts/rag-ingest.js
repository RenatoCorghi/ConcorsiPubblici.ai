import fs, { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// CONFIGURAZIONE
// ==========================================
try {
    const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    });
} catch (e) {
    console.warn("⚠️ Nessun file .env trovato:", e.message);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !GEMINI_API_KEY) {
    console.error("❌ Chiavi mancanti nel .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// 1. ESTRAZIONE ARTICOLI DAL FILE HTML
// Approccio: split per tag heading articolo, poi estrazione testo per blocco
// ==========================================
function extractArticles(html) {
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
        console.error("⚠️  Nessun heading articolo trovato. Il file potrebbe avere struttura diversa.");
        return { titolo_atto, articoli };
    }

    // Step 2: Per ogni heading, prendi il blocco HTML fino al prossimo heading
    for (let i = 0; i < headings.length; i++) {
        const h = headings[i];
        const nextStart = i + 1 < headings.length ? headings[i + 1].startIndex : html.length;
        const blocco = html.slice(h.endOfHeading, nextStart);

        // Estrai rubrica (article-heading-akn)
        const rubrMatch = blocco.match(/<div[^>]*class="article-heading-akn"[^>]*>([\s\S]*?)<\/div>/i);
        const rubrica = rubrMatch ? rubrMatch[1].replace(/<[^>]*>/g, '').trim() : "";

        // Estrai tutto il testo del blocco, pulendo i tag
        const testoPulito = blocco
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

        // Salta articoli vuoti o abrogati (testo troppo corto)
        if (!testoPulito || testoPulito.length < 10) continue;

        articoli.push({ numero: h.numero, rubrica, testo: testoPulito });
    }

    return { titolo_atto, articoli };
}


// ==========================================
// 2. EMBEDDING TRAMITE GEMINI
// ==========================================
async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text: text.substring(0, 8000) }] }, // Limite sicuro
                outputDimensionality: 768
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'API Error');
        return data.embedding.values;
    } catch (e) {
        console.error(`  ❌ Errore embedding:`, e.message);
        return null;
    }
}

// ==========================================
// 3. MAIN
// ==========================================
async function main() {
    const fileArg = process.argv[2];
    const materiaArg = process.argv[3] || 'Generale';

    if (!fileArg) {
        console.log("Uso: node scripts/rag-ingest.js [FILE.html] [MATERIA]");
        console.log('Es.: node scripts/rag-ingest.js data/codici/penale.html "Diritto Penale"');
        process.exit(1);
    }

    console.log(`\n📂 Lettura file: ${fileArg}`);
    const html = fs.readFileSync(fileArg, 'utf8');

    const { titolo_atto, articoli } = extractArticles(html);

    if (articoli.length === 0) {
        console.error("❌ Nessun articolo trovato. Verifica che il file HTML sia un export di Normattiva.");
        return;
    }

    console.log(`✅ Atto: ${titolo_atto}`);
    console.log(`✅ Materia: ${materiaArg}`);
    console.log(`✅ Articoli trovati: ${articoli.length}\n`);

    // Registra il documento padre
    console.log(`📝 Registrazione documento nel database...`);
    const { data: docData, error: docError } = await supabase
        .from('rag_documents')
        .insert([{
            titolo: titolo_atto,
            tipo: 'codice',
            materia: materiaArg,
            filename: fileArg,
            chunks_count: articoli.length,
            status: 'completed'
        }])
        .select()
        .single();

    if (docError) {
        console.error("❌ Errore salvataggio documento:", docError.message);
        return;
    }

    const docId = docData.id;
    console.log(`✅ Documento registrato! ID: ${docId}\n`);
    console.log(`⏳ Inizio vettorializzazione di ${articoli.length} articoli...\n`);

    let ok = 0, fail = 0;

    for (let i = 0; i < articoli.length; i++) {
        const art = articoli[i];
        const label = `Art. ${art.numero}${art.rubrica ? ` - ${art.rubrica}` : ''}`;
        
        // Testo del chunk: contesto + articolo
        const chunkText = `[${titolo_atto} | ${materiaArg}]\n${label}\n\n${art.testo}`;

        process.stdout.write(`[${i+1}/${articoli.length}] 🧠 ${label}... `);

        const vector = await getEmbedding(chunkText);

        if (!vector) {
            console.log(`❌ Embedding fallito, articolo saltato.`);
            fail++;
            continue;
        }

        const { error } = await supabase.from('rag_chunks').insert([{
            document_id: docId,
            content: chunkText,
            chunk_index: i + 1,
            materia: materiaArg,
            tipo: 'codice',
            embedding: vector
        }]);

        if (error) {
            console.log(`❌ DB: ${error.message}`);
            fail++;
        } else {
            console.log(`✅`);
            ok++;
        }
    }

    console.log(`\n🎉 Completato! Salvati: ${ok} | Falliti: ${fail}`);
}

main();
