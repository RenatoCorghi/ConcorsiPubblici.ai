/**
 * INGESTIONE RAG — VIP SCHEDE TRIBUTARIE
 * Carica le 578 schede generate nel database Supabase (rag_documents + rag_chunks)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text }] },
            outputDimensionality: 768
        })
    });
    const data = await response.json();
    if (!data.embedding) throw new Error("Embedding fallito: " + JSON.stringify(data));
    return data.embedding.values;
}

const BASE_DIR = 'schede_tributario_vip';

async function ingestTributario() {
    console.log("🚀 AVVIO INGESTIONE MASSIVA VIP TRIBUTARIO");
    
    if (!fs.existsSync(BASE_DIR)) {
        console.error(`❌ Cartella ${BASE_DIR} non trovata!`);
        return;
    }

    const folders = fs.readdirSync(BASE_DIR).filter(f => fs.statSync(path.join(BASE_DIR, f)).isDirectory());
    console.log(`Trovate ${folders.length} categorie di codici da processare.`);

    for (const folder of folders) {
        const folderPath = path.join(BASE_DIR, folder);
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
        console.log(`\n📂 Cartella: ${folder} (${files.length} schede)`);

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const docUuid = generateUUID(`${folder}_${file}`);
                
                // Estrazione Titolo dalla prima riga (# Titolo)
                const firstLine = content.split('\n')[0].replace('# ', '').trim();
                const titolo = firstLine || `${folder} - ${file}`;
                
                // 1. Inserimento/Update Documento
                const { error: docError } = await supabase.from('rag_documents').upsert({
                    id: docUuid,
                    titolo: titolo,
                    materia: 'Diritto Tributario',
                    tipo: 'scheda_manualistica',
                    autore: 'Antigravity AI / Commissione Tributaria',
                    filename: file,
                    status: 'completed'
                });

                if (docError) throw new Error(`Errore documento: ${docError.message}`);

                // 2. Generazione Embedding e Inserimento Chunk
                // La scheda è corta (< 8k), la carichiamo come chunk unico per mantenere l'integrità del manuale
                const embedding = await getEmbedding(content);

                const { error: chunkError } = await supabase.from('rag_chunks').upsert({
                    id: docUuid, // Usiamo lo stesso UUID per doc e chunk (1:1 per le VIP schede)
                    document_id: docUuid,
                    content: content,
                    embedding: embedding,
                    materia: 'Diritto Tributario',
                    tipo: 'vip_tributario',
                    chunk_index: 0
                });

                if (chunkError) throw new Error(`Errore chunk: ${chunkError.message}`);

                process.stdout.write(`\r   ✅ Ingerito: ${file}          `);

            } catch (e) {
                console.error(`\n   ❌ Errore su ${file}:`, e.message);
                if (e.message.includes('429')) {
                    console.log("   ⏳ Rate limit... attesa 30s");
                    await new Promise(r => setTimeout(r, 30000));
                }
            }
        }
    }
    console.log(`\n\n✨ INGESTIONE TRIBUTARIO COMPLETATA! ✨`);
}

ingestTributario().catch(console.error);
