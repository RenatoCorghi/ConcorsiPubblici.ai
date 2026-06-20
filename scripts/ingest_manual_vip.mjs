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
        throw new Error("Embedding fallito dopo 3 tentativi: " + e.message);
    }
}

async function ingestFile(filePath) {
    console.log(`🚀 Ingestione manuale file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
        console.error(`❌ File non trovato!`);
        return;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const filename = path.basename(filePath);
        const docUuid = generateUUID(`manual_vip_${filename}_${Date.now()}`); // Aggiunto Date.now() per forzare nuovo ID
        
        let titolo = filename.replace('.md', '');
        let materia = 'Diritto Civile';
        let istituto = '';
        
        // Estrazione metadati dal testo
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.startsWith('* Materia:')) materia = line.replace('* Materia:', '').trim();
            if (line.startsWith('* Istituto Principale:')) istituto = line.replace('* Istituto Principale:', '').trim();
            if (line.startsWith('* Riferimento:')) titolo = line.replace('* Riferimento:', '').trim();
        }
        
        // Upsert Documento
        const { error: docError } = await supabase.from('rag_documents').upsert({
            id: docUuid,
            titolo: titolo,
            materia: materia,
            tipo: 'vip_concorsuale',
            autore: 'Manuale (User)',
            filename: filename,
            status: 'completed'
        });

        if (docError) throw new Error(`Errore documento: ${docError.message}`);

        // Get Embedding
        console.log("   Calcolo embedding vettoriale...");
        const embedText = `Documento: ${titolo}\nMateria: ${materia}\n\n${content}`;
        const embedding = await getEmbedding(embedText);

        // Insert Chunk
        const { error: chunkError } = await supabase.from('rag_chunks').upsert({
            id: docUuid, // 1:1 map for VIP schede
            document_id: docUuid,
            content: content,
            embedding: embedding,
            materia: materia,
            tipo: 'vip_civile',
            chunk_index: 0
        });

        if (chunkError) throw new Error(`Errore chunk: ${chunkError.message}`);

        console.log(`\n✅ INGESTIONE COMPLETATA CON SUCCESSO!`);
        console.log(`   ID: ${docUuid}`);
        console.log(`   Titolo: ${titolo}`);
        console.log(`   Materia: ${materia}`);

    } catch (e) {
        console.error(`\n❌ Errore durante l'ingestione:`, e.message);
    }
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Passare il path del file da ingestare.");
    process.exit(1);
}

ingestFile(args[0]).catch(console.error);
