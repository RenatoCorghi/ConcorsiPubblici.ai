/**
 * rag-reindex-corteconti.js
 * ====================================================================
 * Re-indicizzazione con intestazione contestuale dei documenti della
 * Rivista della Corte dei Conti già presenti in rag_chunks.
 *
 * Pipeline per ogni file .md:
 *   1. Legge il file dalla cartella corte_conti_vip_schede/
 *   2. Chiama Gemini Flash per estrarre metadati strutturati (JSON)
 *   3. Costruisce un testo arricchito con intestazione contestuale
 *   4. Genera il nuovo embedding con Gemini Embedding-2
 *   5. Fa UPSERT su rag_chunks (matching per filename)
 * ====================================================================
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// --- Config ---
const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
    console.error('❌ Chiavi mancanti nel .env (SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY)');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const INPUT_DIR = path.resolve('./corte_conti_vip_schede');
const MODEL_FLASH = 'gemini-3-flash-preview';
const MODEL_EMBED = 'gemini-embedding-2';
const BATCH_SIZE = 5;   // embeddings per batch
const DELAY_MS = 2000;  // delay tra le chiamate LLM

// --- Helpers ---
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function parseDirName(dirName) {
    // Es: corteconti_rivista_01_01_2021fascicolo_n_1_2021_rivista
    const annoMatch = dirName.match(/(\d{4})fascicolo/);
    const numMatch = dirName.match(/fascicolo_n_(\d+)_(\d{4})/);
    const anno = annoMatch ? annoMatch[1] : null;
    const num = numMatch ? numMatch[1] : null;
    return {
        edizione: anno && num ? `n. ${num}/${anno}` : dirName,
        anno: anno ? parseInt(anno) : null,
    };
}

// --- Fase 1: Estrazione Metadati con Gemini Flash ---
async function extractMetadata(text, edizioneFallback) {
    const excerpt = text
        .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
        .substring(0, 3000);

    const prompt = `Analizza questo estratto di un saggio dottrinale dalla Rivista della Corte dei Conti e restituisci SOLO un JSON valido (senza markdown, senza blocchi di codice) con questi campi:
{
  "autore": "Nome Cognome dell'autore, o 'Autore Non Specificato' se assente",
  "edizione": "Numero fascicolo e anno, es. 'n. 1/2021'",
  "titolo_saggio": "Titolo esatto del saggio o articolo",
  "argomento_principale": "3-5 parole chiave separate da virgola"
}

ESTRATTO:
${excerpt}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_FLASH}:generateContent?key=${GEMINI_API_KEY}`;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
            
            let raw = data.candidates[0].content.parts[0].text.trim();
            // Pulizia eventuali backtick markdown
            raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const parsed = JSON.parse(raw);
            return {
                autore: parsed.autore || 'Autore Non Specificato',
                edizione: parsed.edizione || edizioneFallback,
                titolo_saggio: parsed.titolo_saggio || 'Titolo Non Specificato',
                argomento_principale: parsed.argomento_principale || 'Diritto Contabile'
            };
        } catch (e) {
            if (attempt === 3) {
                console.warn(`    ⚠️  Estrazione metadati fallita (uso fallback): ${e.message}`);
                return {
                    autore: 'Autore Non Specificato',
                    edizione: edizioneFallback,
                    titolo_saggio: 'Saggio Dottrinale',
                    argomento_principale: 'Contabilità Pubblica, Corte dei Conti'
                };
            }
            await sleep(5000 * attempt);
        }
    }
}

// --- Fase 2: Costruzione testo arricchito ---
function buildEnrichedText(meta, originalText) {
    const clean = originalText.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
    return `[TIPO: Saggio Dottrinale]
[FONTE: Rivista della Corte dei Conti - ${meta.edizione}]
[AUTORE: ${meta.autore}]
[TITOLO: ${meta.titolo_saggio}]
[TEMA: ${meta.argomento_principale}]

${clean}`;
}

// --- Fase 3: Embedding batch ---
async function getEmbeddings(texts) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_EMBED}:batchEmbedContents?key=${GEMINI_API_KEY}`;
    const requests = texts.map(t => ({
        model: `models/${MODEL_EMBED}`,
        content: { parts: [{ text: t.substring(0, 8000) }] },
        outputDimensionality: 768
    }));

    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requests })
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 429) {
                    const wait = 60000 * attempt;
                    console.log(`    ⏳ Rate limit embedding! Attesa ${wait / 1000}s...`);
                    await sleep(wait);
                    continue;
                }
                throw new Error(data.error?.message || `HTTP ${res.status}`);
            }
            return data.embeddings.map(e => e.values);
        } catch (e) {
            if (attempt === 5) throw e;
            await sleep(10000 * attempt);
        }
    }
}

// --- Fase 4: Upsert su Supabase ---
async function upsertChunk(fileName, enrichedText, vector) {
    // Trova il documento esistente tramite filename
    const { data: doc, error: docErr } = await supabase
        .from('rag_documents')
        .select('id')
        .eq('filename', fileName)
        .single();

    if (docErr || !doc) {
        console.warn(`    ⚠️  Documento non trovato in rag_documents per: ${fileName}`);
        return false;
    }

    // Upsert del chunk (aggiorna content + embedding)
    const { error: chunkErr } = await supabase
        .from('rag_chunks')
        .update({
            content: enrichedText,
            embedding: vector
        })
        .eq('document_id', doc.id)
        .eq('chunk_index', 1);

    if (chunkErr) {
        console.error(`    ❌ Errore upsert chunk: ${chunkErr.message}`);
        return false;
    }
    return true;
}

// --- MAIN ---
async function main() {
    console.log('\n🔄 Re-indicizzazione Riviste Corte dei Conti con Intestazione Contestuale');
    console.log('━'.repeat(65));
    console.log(`📂 Input: ${INPUT_DIR}`);
    console.log(`🤖 LLM:   ${MODEL_FLASH}`);
    console.log(`🧮 Embed: ${MODEL_EMBED}\n`);

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`❌ Cartella non trovata: ${INPUT_DIR}`);
        process.exit(1);
    }

    // Raccogli tutti i file
    const allFiles = [];
    const fascicoli = fs.readdirSync(INPUT_DIR).filter(d =>
        fs.statSync(path.join(INPUT_DIR, d)).isDirectory()
    );

    for (const fascicolo of fascicoli) {
        const { edizione } = parseDirName(fascicolo);
        const dir = path.join(INPUT_DIR, fascicolo);
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        files.forEach(f => allFiles.push({
            fascicolo,
            edizione,
            fullPath: path.join(dir, f),
            fileName: f
        }));
    }

    // Filtra i file che hanno contenuto utile
    const toProcess = allFiles.filter(f => {
        const txt = fs.readFileSync(f.fullPath, 'utf8');
        return !txt.includes('[NESSUN_CONTENUTO_UTILE]');
    });

    console.log(`📄 File totali:    ${allFiles.length}`);
    console.log(`✅ Da processare:  ${toProcess.length}`);
    console.log(`⏭️  Senza contenuto: ${allFiles.length - toProcess.length}\n`);

    let success = 0;
    let failed = 0;
    const total = toProcess.length;

    // Processa in batch per gli embeddings
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batch = toProcess.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);
        
        console.log(`\n🔄 Batch ${batchNum}/${totalBatches} [${i + 1}-${Math.min(i + BATCH_SIZE, total)}/${total}]`);

        // Fase 1 + 2: Estrazione metadati e costruzione testi arricchiti
        const enriched = [];
        for (const file of batch) {
            const originalText = fs.readFileSync(file.fullPath, 'utf8');
            process.stdout.write(`  📝 ${file.fileName.substring(0, 60)}... `);
            
            const meta = await extractMetadata(originalText, file.edizione);
            const enrichedText = buildEnrichedText(meta, originalText);
            enriched.push({ ...file, enrichedText, meta });
            
            process.stdout.write(`✅ [${meta.autore}]\n`);
            await sleep(DELAY_MS);
        }

        // Fase 3: Embedding batch
        try {
            const vectors = await getEmbeddings(enriched.map(e => e.enrichedText));
            
            // Fase 4: Upsert
            for (let j = 0; j < enriched.length; j++) {
                const { fileName, enrichedText } = enriched[j];
                const vector = vectors[j];
                const ok = await upsertChunk(fileName, enrichedText, vector);
                if (ok) {
                    success++;
                    console.log(`    💾 Upsert OK: ${fileName}`);
                } else {
                    failed++;
                }
            }
        } catch (e) {
            console.error(`  ❌ Errore embedding batch: ${e.message}`);
            failed += batch.length;
        }

        // Pausa tra batch per rispettare rate limits
        if (i + BATCH_SIZE < toProcess.length) {
            await sleep(3000);
        }
    }

    console.log('\n' + '━'.repeat(65));
    console.log(`✨ COMPLETATO!`);
    console.log(`   ✅ Re-indicizzati con successo: ${success}`);
    console.log(`   ❌ Falliti:                    ${failed}`);
    console.log(`   📊 Totale processato:          ${success + failed}/${total}`);
}

main().catch(err => {
    console.error('💥 Errore fatale:', err);
    process.exit(1);
});
