import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

function generateUUID(name) {
    return crypto.createHash('sha256').update(name).digest('hex').substring(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

async function getEmbedding(text, retry = 0) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text }] },
                taskType: 'RETRIEVAL_DOCUMENT',
                outputDimensionality: 768
            })
        });
        const data = await response.json();
        if (!data.embedding) throw new Error(JSON.stringify(data));
        return data.embedding.values;
    } catch (e) {
        if (retry < 3) {
            await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
            return getEmbedding(text, retry + 1);
        }
        throw new Error("Embedding fallito: " + e.message);
    }
}

function chunkText(text, size = 1500, overlap = 200) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.substring(i, i + size));
        i += (size - overlap);
    }
    return chunks;
}

const BASE_DIR = path.join(process.cwd(), 'data', 'diritto_penale');

async function getAllPdfFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(await getAllPdfFiles(filePath));
        } else if (file.toLowerCase().endsWith('.pdf')) {
            results.push(filePath);
        }
    }
    return results;
}

async function run() {
    console.log("🚀 AVVIO INGESTIONE MASSIVA PDF (Diritto Penale)");
    const files = await getAllPdfFiles(BASE_DIR);
    console.log(`Trovati ${files.length} PDF da processare.\n`);

    for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const filename = path.basename(filePath);
        const docUuid = generateUUID(`pdf_penale_${filename}`);

        // Check if already ingested
        const { data: existing } = await supabase.from('rag_documents').select('id').eq('id', docUuid);
        if (existing && existing.length > 0) {
            console.log(`⏭️  Skip (già ingerito): ${filename}`);
            continue;
        }

        console.log(`\n📄 Processando [${i + 1}/${files.length}]: ${filename}`);
        
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            const text = data.text.replace(/\s+/g, ' ').trim();
            
            if (text.length < 50) {
                console.warn(`⚠️  Testo troppo corto o illeggibile per ${filename}. Skip.`);
                continue;
            }

            // 1. Insert Document
            const { error: docError } = await supabase.from('rag_documents').upsert({
                id: docUuid,
                titolo: filename.replace('.pdf', ''),
                materia: 'Diritto Penale',
                tipo: 'dottrina_oa', // Or other type
                autore: 'Istituzionale',
                filename: filename,
                status: 'completed'
            });

            if (docError) throw new Error(`Errore documento: ${docError.message}`);

            // 2. Chunking & Embedding
            const chunks = chunkText(text, 2000, 300);
            console.log(`   Generati ${chunks.length} chunks. Calcolo embeddings...`);

            for (let c = 0; c < chunks.length; c++) {
                const chunkTextContent = chunks[c];
                const embedText = `Documento: ${filename}\nMateria: Diritto Penale\n\n${chunkTextContent}`;
                const embedding = await getEmbedding(embedText);

                const chunkUuid = generateUUID(`chunk_${docUuid}_${c}`);
                const { error: chunkError } = await supabase.from('rag_chunks').upsert({
                    id: chunkUuid,
                    document_id: docUuid,
                    content: chunkTextContent,
                    embedding: embedding,
                    materia: 'Diritto Penale',
                    tipo: 'dottrina_oa',
                    chunk_index: c
                });

                if (chunkError) throw new Error(`Errore chunk ${c}: ${chunkError.message}`);
                process.stdout.write(`\r   ✅ Chunk ${c + 1}/${chunks.length} ingerito.`);
                await new Promise(r => setTimeout(r, 400)); // Rate limit 
            }
            console.log(`\n   ✅ Documento ${filename} completato!`);

        } catch (e) {
            console.error(`\n❌ Errore su ${filename}:`, e.message);
        }
    }
    
    console.log(`\n🎉 INGESTIONE PDF MASSIVA COMPLETATA!`);
}

run().catch(console.error);
