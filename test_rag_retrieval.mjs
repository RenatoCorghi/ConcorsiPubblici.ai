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

async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text: text }] },
            outputDimensionality: 768
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.embedding.values;
}

async function searchRAG(query) {
    console.log(`\n🔍 Domanda: "${query}"`);
    console.log(`⏳ Calcolo embedding della domanda...`);
    
    try {
        const queryEmbedding = await getEmbedding(query);
        
        console.log(`⏳ Ricerca vettoriale su Supabase in corso...`);
        const { data, error } = await supabase.rpc('match_rag_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: 0.5, // 0.5 è un buon punto di partenza per Gemini Embedding
            match_count: 3        // Vogliamo i migliori 3 risultati
        });

        if (error) {
            console.error("❌ Errore Supabase RPC:", error.message);
            return;
        }

        if (!data || data.length === 0) {
            console.log(" Nessun risultato trovato con questo grado di similarità.");
            return;
        }

        console.log(`\n🏆 Trovati ${data.length} risultati:\n`);
        
        data.forEach((result, i) => {
            console.log(`=================================================`);
            console.log(`Risultato #${i + 1} (Affinità: ${(result.similarity * 100).toFixed(1)}%)`);
            console.log(`Titolo: ${result.titolo || 'N/A'}`);
            console.log(`Materia: ${result.materia || 'N/A'}`);
            console.log(`-------------------------------------------------`);
            // Stampiamo solo i primi 500 caratteri per non intasare il terminale
            console.log(result.content.substring(0, 500) + '...\n');
        });

    } catch (e) {
        console.error("❌ Errore generale:", e.message);
    }
}

// ==========================================
// Metti qui la tua domanda di prova!
// ==========================================
const queryDaTestare = "Quali sono i limiti del potere di annullamento d'ufficio (autotutela) su titoli edilizi rilasciati molti anni fa?";

searchRAG(queryDaTestare);
