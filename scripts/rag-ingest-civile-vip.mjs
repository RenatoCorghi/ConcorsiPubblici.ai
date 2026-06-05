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

const BASE_DIR = path.join(process.cwd(), 'schede_civile_vip', 'corte_costituzionale');

async function ingestCivileVIP() {
    console.log("🚀 AVVIO INGESTIONE VIP CIVILE (Corte Costituzionale)");
    
    if (!fs.existsSync(BASE_DIR)) {
        console.error(`❌ Cartella ${BASE_DIR} non trovata!`);
        return;
    }

    const files = fs.readdirSync(BASE_DIR).filter(f => f.endsWith('.md'));
    console.log(`Trovate ${files.length} schede VIP da processare.\n`);

    let n = 0;
    for (const file of files) {
        n++;
        const filePath = path.join(BASE_DIR, file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const docUuid = generateUUID(`civ_vip_${file}`);
            
            // Check if already ingested
            const { data: existing } = await supabase.from('rag_chunks').select('id').eq('id', docUuid);
            if (existing && existing.length > 0) {
                process.stdout.write(`\r   ⏭️  Skip (già ingerito) [${n}/${files.length}]: ${file}          `);
                continue;
            }
            
            // Estrazione metadati dal contenuto della scheda
            let titolo = file.replace('.md', '');
            let materia = 'Diritto Civile e Costituzionale';
            let autorita = 'Corte Costituzionale VIP';
            
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.startsWith('* Materia/Area:')) materia = line.replace('* Materia/Area:', '').trim();
                if (line.startsWith('* Autorità:')) autorita = line.replace('* Autorità:', '').trim();
            }
            
            // 1. Inserimento/Update Documento
            const { error: docError } = await supabase.from('rag_documents').upsert({
                id: docUuid,
                titolo: `${autorita} - ${titolo}`,
                materia: materia,
                tipo: 'sentenza_costituzionale',
                autore: 'Antigravity AI VIP',
                filename: file,
                status: 'completed'
            });

            if (docError) throw new Error(`Errore documento: ${docError.message}`);

            // 2. Generazione Embedding e Inserimento Chunk
            const embedding = await getEmbedding(content);

            const { error: chunkError } = await supabase.from('rag_chunks').upsert({
                id: docUuid, // 1:1 per le VIP schede
                document_id: docUuid,
                content: content,
                embedding: embedding,
                materia: materia,
                tipo: 'vip_civile',
                chunk_index: 0
            });

            if (chunkError) throw new Error(`Errore chunk: ${chunkError.message}`);

            process.stdout.write(`\r   ✅ Ingerito [${n}/${files.length}]: ${file}          `);

            // Piccolo delay per rate limit di embedding
            await new Promise(r => setTimeout(r, 500));

        } catch (e) {
            console.error(`\n   ❌ Errore su ${file}:`, e.message);
        }
    }
    console.log(`\n\n✨ INGESTIONE COMPLETATA! Inserite ${files.length} schede VIP! ✨`);
}

ingestCivileVIP().catch(console.error);
