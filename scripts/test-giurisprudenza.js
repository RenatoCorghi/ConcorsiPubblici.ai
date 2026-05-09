import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Mini dotenv loader
try {
    const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    });
} catch (e) {}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function generateEmbedding(text) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "models/gemini-embedding-2",
            content: { parts: [{ text }] },
            outputDimensionality: 768
        }),
    });
    const data = await response.json();
    return data.embedding.values;
}

async function testRicerca(query) {
    console.log(`🔍 Ricerca per: "${query}"...`);
    
    try {
        const queryEmbedding = await generateEmbedding(query);

        // Richiama la funzione RPC di Supabase (match_chunks)
        const { data: results, error } = await supabase.rpc('match_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.5,
            match_count: 5
        });

        if (error) throw error;

        console.log(`\n✅ Trovati ${results.length} risultati rilevanti:\n`);

        results.forEach((res, i) => {
            console.log(`--- RISULTATO ${i+1} (Score: ${res.similarity.toFixed(3)}) ---`);
            console.log(res.content);
            console.log(`\n`);
        });

    } catch (err) {
        console.error("❌ Errore:", err.message);
    }
}

// Fai il test
const queryTest = process.argv[2] || "grave illecito professionale appalti esclusione";
testRicerca(queryTest);
