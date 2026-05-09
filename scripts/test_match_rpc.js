import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function testMatch() {
    // 1. Genera embedding
    const testQuery = "autotutela amministrativa annullamento d'ufficio art 21 nonies";
    const embedRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text: testQuery }] },
                outputDimensionality: 768
            })
        }
    );
    const embedData = await embedRes.json();
    const vector = embedData.embedding?.values;

    // 2. Test match_rag_chunks con vari parametri
    console.log("═══ TEST match_rag_chunks — VERIFICA PARAMETRI ═══\n");

    // Test base
    const { data: r1, error: e1 } = await supabase.rpc('match_rag_chunks', {
        query_embedding: vector,
        match_count: 5,
        match_threshold: 0.5
    });
    console.log(`Base (senza filtro): ${e1 ? '❌ ' + e1.message : '✅ ' + r1.length + ' risultati'}`);
    if (r1) {
        r1.forEach((r, i) => {
            console.log(`  ${i+1}. [${r.materia}/${r.tipo}] sim=${r.similarity?.toFixed(3)} → "${(r.content||'').substring(0,80)}..."`);
        });
    }

    // Test con parametro filter_materia (potrebbe non essere supportato da questa RPC)
    console.log("\n--- Con filter_materia ---");
    const { data: r2, error: e2 } = await supabase.rpc('match_rag_chunks', {
        query_embedding: vector,
        match_count: 5,
        match_threshold: 0.5,
        filter_materia: 'Diritto Amministrativo'
    });
    console.log(`Con filtro: ${e2 ? '❌ ' + e2.message : '✅ ' + r2.length + ' risultati'}`);
    if (r2) {
        r2.forEach((r, i) => {
            console.log(`  ${i+1}. [${r.materia}/${r.tipo}] sim=${r.similarity?.toFixed(3)} → "${(r.content||'').substring(0,80)}..."`);
        });
    }

    // Verifica i campi disponibili nella risposta
    console.log("\n--- Campi disponibili nel risultato ---");
    if (r1 && r1[0]) {
        console.log(Object.keys(r1[0]));
    }
}

testMatch().catch(e => console.error("Fatal:", e));
