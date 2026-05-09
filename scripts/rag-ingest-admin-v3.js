import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Caricamento .env
const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const INPUT_DIR = path.resolve('./sentenze_admin_vip');

async function getEmbedding(text, retries = 3) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/gemini-embedding-2',
                    content: { parts: [{ text: text.substring(0, 8000) }] },
                    outputDimensionality: 768
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.embedding.values;
        } catch (e) {
            if (attempt === retries) throw e;
            const wait = attempt * 5000;
            console.log(`     ⏳ Errore embedding, riprovo tra ${wait/1000}s...`);
            await new Promise(r => setTimeout(r, wait));
        }
    }
}

async function main() {
    console.log("🚀 Avvio Ingestion Schede VIP Amministrativo (Versione Corretta)...");

    if (!fs.existsSync(INPUT_DIR)) {
        console.error("❌ Cartella non trovata:", INPUT_DIR);
        return;
    }

    // STEP 1: Recupero file già processati per evitare duplicati
    console.log("📡 Recupero indice file già presenti in DB...");
    const existingFiles = new Set();
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('rag_documents')
            .select('filename')
            .eq('tipo', 'sentenza_admin')
            .range(offset, offset + 999);
        if (error || !data || data.length === 0) break;
        data.forEach(d => existingFiles.add(d.filename));
        offset += 1000;
        if (data.length < 1000) break;
    }
    console.log(`✅ Trovati ${existingFiles.size} file già in DB.`);

    const allFiles = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.md'));
    const files = allFiles.filter(f => !existingFiles.has(f));
    
    console.log(`📂 File totali su disco: ${allFiles.length}`);
    console.log(`🆕 Da processare: ${files.length} (saltati ${allFiles.length - files.length} già presenti)`);

    for (const file of files) {
        const filePath = path.join(INPUT_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // --- FILTRO SCARTI ---
        if (content.includes('[SCARTO_ASSOLUTO]')) {
            console.log(`   ⏭️  Salto scarto: ${file}`);
            continue;
        }

        const title = file.replace('.md', '').replace(/_/g, ' ');
        console.log(`\n📄 Processando: ${file}`);
        
        // 1. Inserimento Documento
        const { data: doc, error: docErr } = await supabase
            .from('rag_documents')
            .insert([{
                titolo: title,
                tipo: 'sentenza_admin',
                materia: 'Diritto Amministrativo',
                filename: file,
                chunks_count: 0
            }])
            .select()
            .single();

        if (docErr) {
            console.error("   ❌ Errore inserimento documento:", docErr.message);
            continue;
        }

        // 2. Chunks - Splittiamo per sezioni
        const chunks = content.split(/### /).filter(c => c.trim().length > 0);
        
        for (let i = 0; i < chunks.length; i++) {
            let chunkText = chunks[i].trim();
            // NOTA: 'title' è derivato dal filename (es. "cds 2025 202509430") che contiene
            // un codice di registro interno, NON il numero della sentenza.
            // NON usarlo come "Documento: xxx" per evitare che l'AI lo confonda con un numero di sentenza.
            let enrichedContent = `[Scheda VIP Giustizia Amministrativa — Codice registro: ${title}]\nSezione: ${chunkText}`;
            
            try {
                const embedding = await getEmbedding(enrichedContent);
                const { error: chunkErr } = await supabase
                    .from('rag_chunks')
                    .insert([{
                        document_id: doc.id,
                        content: enrichedContent,
                        embedding: embedding,
                        chunk_index: i,
                        materia: 'Diritto Amministrativo',
                        tipo: 'sentenza_admin'
                    }]);

                if (chunkErr) {
                    console.error(`   ❌ Errore chunk ${i}:`, chunkErr.message);
                }
            } catch (e) {
                console.error(`   ❌ Errore embedding chunk ${i}:`, e.message);
            }
            await new Promise(r => setTimeout(r, 500)); 
        }
        
        // Aggiorna conteggio chunk
        await supabase.from('rag_documents').update({ chunks_count: chunks.length }).eq('id', doc.id);
        console.log(`   ✅ Vettorializzato in ${chunks.length} chunks.`);
    }

    console.log("\n✨ Ingestion completata!");
}

main().catch(console.error);
