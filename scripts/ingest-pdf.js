#!/usr/bin/env node
/* ============================================================
   INGEST-PDF.JS — Pipeline di Ingestione PDF per il Sistema RAG
   
   Legge i PDF dalla cartella data/rag-sources/, li converte in
   testo, li spezza in chunks e li salva su Supabase con embedding.
   
   Uso:
     node scripts/ingest-pdf.js                     # Ingerisce tutti i PDF nuovi
     node scripts/ingest-pdf.js --file=manuale.pdf  # Ingerisce un singolo file
     node scripts/ingest-pdf.js --reindex            # Rigenera gli embedding
   
   Requisiti:
     npm install pdf-parse
     set SUPABASE_SERVICE_KEY=eyJ...
     set GOOGLE_AI_KEY=AIza...  (per gli embedding)
   ============================================================ */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename, extname } from 'path';
import { createHash } from 'crypto';

// --- CONFIG ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;

if (!SUPABASE_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY non trovata.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const RAG_SOURCES_DIR = join(process.cwd(), 'data', 'rag-sources');
const CHUNK_SIZE = 1500;       // Caratteri per chunk (~300-400 parole)
const CHUNK_OVERLAP = 200;     // Sovrapposizione tra chunks per continuità
const EMBEDDING_MODEL = 'text-embedding-004'; // Google embedding model
const EMBEDDING_DIM = 768;
const BATCH_SIZE = 10;         // Chunks per batch di embedding

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================
// STEP 1: Lettura e parsing PDF
// ============================================================
async function extractTextFromPDF(filePath) {
    // Importa pdf-parse dinamicamente
    let pdfParse;
    try {
        pdfParse = (await import('pdf-parse')).default;
    } catch (e) {
        console.error('❌ Libreria pdf-parse non trovata. Installa con: npm install pdf-parse');
        process.exit(1);
    }
    
    const dataBuffer = readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
}

// ============================================================
// STEP 2: Chunking intelligente
// ============================================================
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const chunks = [];
    
    // Pulizia testo
    text = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
    
    // Splitta per paragrafi prima
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    
    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed || trimmed.length < 20) continue;
        
        if ((currentChunk + '\n\n' + trimmed).length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            // Overlap: prendi le ultime parole del chunk precedente
            const words = currentChunk.split(/\s+/);
            const overlapWords = words.slice(-Math.floor(overlap / 5));
            currentChunk = overlapWords.join(' ') + '\n\n' + trimmed;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
        }
    }
    
    if (currentChunk.trim().length > 50) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

// ============================================================
// STEP 3: Generazione Embedding con Google AI
// ============================================================
async function generateEmbedding(text) {
    if (!GOOGLE_AI_KEY) {
        console.warn('⚠️ GOOGLE_AI_KEY non trovata. Embedding saltato.');
        return null;
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GOOGLE_AI_KEY}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text: text.substring(0, 8000) }] }
            })
        });
        
        if (!response.ok) {
            const err = await response.text();
            console.error(`   ❌ Embedding API error: ${response.status} - ${err.substring(0, 200)}`);
            return null;
        }
        
        const data = await response.json();
        return data.embedding?.values || null;
    } catch (e) {
        console.error(`   ❌ Embedding error: ${e.message}`);
        return null;
    }
}

async function generateEmbeddingsBatch(chunks) {
    const results = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        console.log(`   🧠 Embedding batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(chunks.length/BATCH_SIZE)}...`);
        
        const embeddings = await Promise.all(
            batch.map(chunk => generateEmbedding(chunk.content))
        );
        
        for (let j = 0; j < batch.length; j++) {
            results.push({ ...batch[j], embedding: embeddings[j] });
        }
        
        await sleep(500); // Rate limiting
    }
    return results;
}

// ============================================================
// STEP 4: Salvataggio su Supabase
// ============================================================
async function saveDocument(doc) {
    const { data, error } = await supabase
        .from('rag_documents')
        .upsert(doc, { onConflict: 'file_hash' })
        .select()
        .single();
    
    if (error) {
        console.error(`   ❌ Errore salvataggio documento: ${error.message}`);
        return null;
    }
    return data;
}

async function saveChunks(documentId, chunks) {
    let saved = 0;
    for (const chunk of chunks) {
        const row = {
            document_id: documentId,
            content: chunk.content,
            chunk_index: chunk.index,
            materia: chunk.materia,
            tipo: chunk.tipo,
            embedding: chunk.embedding
        };
        
        const { error } = await supabase
            .from('rag_chunks')
            .insert(row);
        
        if (error) {
            console.error(`   ❌ Chunk ${chunk.index}: ${error.message}`);
        } else {
            saved++;
        }
    }
    return saved;
}

// ============================================================
// STEP 5: Detect materia dal contenuto
// ============================================================
function detectMateria(text, filename) {
    const lower = (text + ' ' + filename).toLowerCase();
    
    if (lower.includes('penale') || lower.includes('reato') || lower.includes('imputat') || lower.includes('p.m.')) return 'Penale';
    if (lower.includes('amministrativ') || lower.includes('p.a.') || lower.includes('tar ') || lower.includes('consiglio di stato')) return 'Amministrativo';
    if (lower.includes('civile') || lower.includes('contratt') || lower.includes('obbligaz') || lower.includes('successio')) return 'Civile';
    
    return 'Generale';
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  📚  INGEST-PDF — Pipeline RAG');
    console.log('  📅  ' + new Date().toLocaleString('it-IT'));
    console.log('═══════════════════════════════════════════════════');
    
    // Crea la cartella sorgente se non esiste
    if (!existsSync(RAG_SOURCES_DIR)) {
        mkdirSync(RAG_SOURCES_DIR, { recursive: true });
        console.log(`\n📁 Cartella creata: ${RAG_SOURCES_DIR}`);
        console.log('   Inserisci i PDF qui dentro e rilancia lo script.');
        return;
    }
    
    // Trova tutti i PDF
    const files = readdirSync(RAG_SOURCES_DIR).filter(f => extname(f).toLowerCase() === '.pdf');
    
    if (files.length === 0) {
        console.log(`\n⚠️ Nessun PDF trovato in ${RAG_SOURCES_DIR}`);
        console.log('   Inserisci i file PDF e rilancia lo script.');
        return;
    }
    
    console.log(`\n📄 Trovati ${files.length} file PDF`);
    
    // Filtra per singolo file se --file= è specificato
    const fileArg = process.argv.find(a => a.startsWith('--file='));
    const targetFile = fileArg ? fileArg.split('=')[1] : null;
    const filesToProcess = targetFile ? files.filter(f => f === targetFile) : files;
    
    let totalChunks = 0;
    let totalDocs = 0;
    
    for (const file of filesToProcess) {
        const filePath = join(RAG_SOURCES_DIR, file);
        console.log(`\n📖 Processing: ${file}`);
        
        // Calcola hash per evitare re-importazioni
        const fileBuffer = readFileSync(filePath);
        const fileHash = createHash('md5').update(fileBuffer).digest('hex');
        
        // Controlla se già importato
        const { data: existing } = await supabase
            .from('rag_documents')
            .select('id, status')
            .eq('file_hash', fileHash)
            .single();
        
        if (existing && existing.status === 'completed') {
            console.log(`   ⏭️ Già importato (hash: ${fileHash.substring(0, 8)})`);
            continue;
        }
        
        // Estrai testo
        console.log('   📝 Estrazione testo...');
        let text;
        try {
            text = await extractTextFromPDF(filePath);
        } catch (e) {
            console.error(`   ❌ Errore parsing PDF: ${e.message}`);
            continue;
        }
        
        if (!text || text.length < 100) {
            console.log('   ⚠️ PDF vuoto o troppo corto, saltato.');
            continue;
        }
        
        console.log(`   📊 ${text.length} caratteri estratti (~${Math.round(text.length / 5)} parole)`);
        
        // Detect materia
        const materia = detectMateria(text, file);
        console.log(`   🏷️ Materia rilevata: ${materia}`);
        
        // Chunking
        const rawChunks = chunkText(text);
        console.log(`   🔪 ${rawChunks.length} chunks generati`);
        
        // Prepara chunks con metadati
        const chunks = rawChunks.map((content, index) => ({
            content,
            index,
            materia,
            tipo: 'manuale'
        }));
        
        // Salva documento
        const doc = await saveDocument({
            titolo: basename(file, '.pdf').replace(/[-_]/g, ' '),
            tipo: 'manuale',
            materia,
            filename: file,
            file_hash: fileHash,
            chunks_count: chunks.length,
            status: 'processing'
        });
        
        if (!doc) continue;
        
        // Genera embedding (se API key disponibile)
        let chunksWithEmbeddings;
        if (GOOGLE_AI_KEY) {
            console.log('   🧠 Generazione embedding...');
            chunksWithEmbeddings = await generateEmbeddingsBatch(chunks);
        } else {
            console.log('   ⚠️ GOOGLE_AI_KEY mancante, embedding saltati.');
            chunksWithEmbeddings = chunks.map(c => ({ ...c, embedding: null }));
        }
        
        // Salva chunks
        console.log('   💾 Salvataggio chunks...');
        const saved = await saveChunks(doc.id, chunksWithEmbeddings);
        console.log(`   ✅ ${saved}/${chunks.length} chunks salvati`);
        
        // Aggiorna stato documento
        await supabase
            .from('rag_documents')
            .update({ status: 'completed', chunks_count: saved, updated_at: new Date().toISOString() })
            .eq('id', doc.id);
        
        totalChunks += saved;
        totalDocs++;
    }
    
    // Report finale
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  📊  REPORT FINALE');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  📚 Documenti processati: ${totalDocs}`);
    console.log(`  🧩 Chunks totali:        ${totalChunks}`);
    console.log(`  🧠 Embedding:            ${GOOGLE_AI_KEY ? '✅ Attivi' : '⚠️ Saltati (no API key)'}`);
    console.log('═══════════════════════════════════════════════════');
}

main().catch(e => {
    console.error('💥 Errore fatale:', e);
    process.exit(1);
});
