import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(l => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function getEmbedding(text) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${env.GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text }] },
                outputDimensionality: 768
            })
        }
    );
    const data = await res.json();
    return data.embedding.values;
}

async function main() {
    const query = "Nel diritto dei contratti pubblici, qual è il 'punto di caduta' del soccorso istruttorio rispetto all'offerta tecnica?";
    const vector = await getEmbedding(query);

    // Test 1: Ricerca standard (top 15)
    const { data: standard } = await supabase.rpc('match_rag_chunks', {
        query_embedding: vector,
        match_threshold: 0.3, // soglia bassissima
        match_count: 50       // molti risultati
    });

    console.log(`Risultati totali con threshold 0.3: ${standard.length}\n`);

    // Cerca i chunk di teoria tra i risultati
    const teoria = standard.filter(m => m.tipo === 'teoria_massimario');
    const nomofilachia = standard.filter(m => m.tipo === 'nomofilachia_ssuu');
    const sentenze = standard.filter(m => m.tipo === 'sentenza' || m.tipo === 'sentenza_admin');

    console.log(`Breakdown per tipo:`);
    console.log(`  sentenza:          ${sentenze.length}`);
    console.log(`  teoria_massimario: ${teoria.length}`);
    console.log(`  nomofilachia_ssuu: ${nomofilachia.length}`);
    console.log(`  altri:             ${standard.length - sentenze.length - teoria.length - nomofilachia.length}\n`);

    if (teoria.length > 0) {
        console.log('📚 TEORIA TROVATA!');
        teoria.forEach(t => {
            console.log(`  Similarità: ${(t.similarity * 100).toFixed(1)}% | ${t.titolo || 'no titolo'}`);
            console.log(`  Preview: ${t.content.substring(0, 200)}\n`);
        });
    } else {
        console.log('⚠️ Nessun chunk teoria nei primi 50 risultati.');
        console.log(`   Range similarità: ${(standard[standard.length-1].similarity*100).toFixed(1)}% - ${(standard[0].similarity*100).toFixed(1)}%`);
    }

    if (nomofilachia.length > 0) {
        console.log('🏛️ NOMOFILACHIA TROVATA!');
        nomofilachia.forEach(t => {
            console.log(`  Similarità: ${(t.similarity * 100).toFixed(1)}% | ${t.titolo || 'no titolo'}`);
        });
    }
}

main();
