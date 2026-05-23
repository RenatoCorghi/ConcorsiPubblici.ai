import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

async function runPenalTest() {
    console.log("🔍 Esecuzione RAG Stress Test - SETTORE PENALE v3...");

    const queries = [
        { q: "La confisca allargata e i limiti all'applicazione retroattiva rispetto alla CEDU", m: "Diritto Penale" },
        { q: "Messa alla prova e responsabilità degli enti ex D.Lgs. 231/2001", m: "Diritto Penale" },
        { q: "Criteri di imputazione soggettiva, dolo eventuale e sistemi di intelligenza artificiale", m: "Diritto Penale" }
    ];

    for (const test of queries) {
        console.log(`\n======================================================`);
        console.log(`❓ DOMANDA: "${test.q}"`);
        try {
            // Genera embedding
            const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/gemini-embedding-2',
                    content: { parts: [{ text: test.q }] },
                    outputDimensionality: 768
                })
            });
            const embedData = await embedRes.json();
            const vector = embedData.embedding?.values;
            
            if (!vector) {
                console.log("❌ Errore embedding"); continue;
            }

            const { data: matches, error } = await supabase.rpc('search_knowledge', {
                query_embedding: vector,
                match_count: 3,
                similarity_threshold: 0.60,
                filter_materia: test.m
            });
            
            if (error) {
                console.log("❌ Errore RPC:", error.message);
            } else if (!matches || matches.length === 0) {
                console.log(`⚠️ Nessun risultato!`);
            } else {
                console.log(`🎯 Trovati ${matches.length} risultati pertinenti:\n`);
                matches.forEach((m, i) => {
                    console.log(`[${i+1}] 🔖 TIPO: ${m.tipo} | 📊 SIMILARITÀ: ${(m.similarity * 100).toFixed(1)}%`);
                    
                    // Mostra un estratto ragionato
                    const contentSnippet = m.content.substring(0, 350).replace(/\n+/g, ' ');
                    console.log(`    📝 ESTRATTO: "${contentSnippet}..."\n`);
                });
            }
        } catch(e) {
            console.log("Errore:", e.message);
        }
    }
}

runPenalTest();
