/**
 * INGESTIONE RAG — VIP SCHEDE PENALE v3
 * Carica le schede generate (Discrimen/Sistema Penale) nel database Supabase
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

const BASE_DIR = 'riviste_penale_vip_v3';

async function ingestPenale() {
    console.log("🚀 AVVIO INGESTIONE MASSIVA VIP PENALE v3");
    
    if (!fs.existsSync(BASE_DIR)) {
        console.error(`❌ Cartella ${BASE_DIR} non trovata!`);
        return;
    }

    const files = fs.readdirSync(BASE_DIR).filter(f => f.endsWith('.md'));
    console.log(`Trovate ${files.length} schede da processare.`);

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(BASE_DIR, file);
        const docUuid = generateUUID(`penale_v3_${file}`);
        
        try {
            // Verifica se il documento esiste già nel database
            const { data: existingDoc, error: checkError } = await supabase
                .from('rag_documents')
                .select('id')
                .eq('id', docUuid)
                .maybeSingle();

            if (checkError) throw new Error(`Errore check: ${checkError.message}`);

            if (existingDoc) {
                if (i % 20 === 0) {
                    process.stdout.write(`\r   [${i+1}/${files.length}] Skip (già nel DB)`);
                }
                continue;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            
            // Estrazione Titolo
            const titleMatch = content.match(/^# (.*)$/m);
            const istitutoMatch = content.match(/\* Istituto Principale: (.*)$/m);
            const titolo = titleMatch ? titleMatch[1].trim() : (istitutoMatch ? istitutoMatch[1].trim() : file);

            // 1. Inserimento Documento
            const { error: docError } = await supabase.from('rag_documents').upsert({
                id: docUuid,
                titolo: titolo,
                materia: 'Diritto Penale',
                tipo: 'scheda_manualistica_v3',
                autore: 'Antigravity AI (Doctrinal Rewrite)',
                filename: file,
                status: 'completed'
            });

            if (docError) throw new Error(`Errore doc: ${docError.message}`);

            // 2. Inserimento Chunk con Embedding
            const embedding = await getEmbedding(content.substring(0, 8000));

            const { error: chunkError } = await supabase.from('rag_chunks').upsert({
                id: docUuid, // 1:1 mapping per schede brevi
                document_id: docUuid,
                content: content,
                embedding: embedding,
                materia: 'Diritto Penale',
                tipo: 'vip_penale_v3',
                chunk_index: 0
            });

            if (chunkError) throw new Error(`Errore chunk: ${chunkError.message}`);

            if (i % 10 === 0) {
                process.stdout.write(`\r   [${i+1}/${files.length}] ✅ Ingerito: ${file.substring(0, 30)}...`);
            }

        } catch (e) {
            console.error(`\n   ❌ Errore su ${file}:`, e.message);
            if (e.message.includes('429')) {
                console.log("   ⏳ Rate limit... attesa 30s");
                await new Promise(r => setTimeout(r, 30000));
                i--; // Retry
            }
        }
    }
    console.log(`\n\n✨ INGESTIONE PENALE v3 COMPLETATA! ✨`);
}

ingestPenale().catch(console.error);
