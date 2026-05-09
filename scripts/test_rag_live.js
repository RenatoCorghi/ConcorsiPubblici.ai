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

async function getEmbedding(text) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`,
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
    return (await res.json()).embedding.values;
}

async function testLive() {
    const query = "Nel diritto dei contratti pubblici, qual è il 'punto di caduta' del soccorso istruttorio rispetto all'offerta tecnica? In quali casi la giurisprudenza amministrativa ritiene che l'integrazione documentale richiesta dalla P.A. si trasformi in un'inammissibile modificazione dell'offerta, determinando un vulnus al principio della par condicio dei concorrenti?";
    
    console.log("🔍 TEST RAG LIVE - TRIPLE SEARCH (come il proxy)\n");
    
    const vector = await getEmbedding(query);
    
    // TRIPLE SEARCH: standard + teoria + nomofilachia
    const [standard, teoria, nomo] = await Promise.all([
        supabase.rpc('match_rag_chunks', { query_embedding: vector, match_threshold: 0.55, match_count: 12 }),
        supabase.rpc('match_rag_chunks_by_tipo', { query_embedding: vector, match_threshold: 0.40, match_count: 3, filter_tipo: 'teoria_massimario' }),
        supabase.rpc('match_rag_chunks_by_tipo', { query_embedding: vector, match_threshold: 0.40, match_count: 3, filter_tipo: 'nomofilachia_ssuu' })
    ]);

    if (standard.error) { console.error("❌", standard.error.message); return; }

    // Merge e de-duplica
    const seen = new Set();
    const matches = [];
    for (const m of [...(standard.data||[]), ...(teoria.data||[]), ...(nomo.data||[])]) {
        if (!seen.has(m.id)) { seen.add(m.id); matches.push(m); }
    }

    console.log(`Standard: ${standard.data?.length||0} | Teoria: ${teoria.data?.length||0} | Nomo: ${nomo.data?.length||0} | Merged: ${matches.length}\n`);

    // Boosting
    matches.forEach(m => {
        m.boostedScore = m.similarity;
        if (m.tipo === 'teoria_massimario') m.boostedScore *= 1.35;
        if (m.tipo === 'nomofilachia_ssuu') m.boostedScore *= 1.25;
    });
    matches.sort((a, b) => b.boostedScore - a.boostedScore);

    console.log("| # | Boosted | Sim | Tipo | Titolo |");
    console.log("|---|---|---|---|---|");
    matches.slice(0, 10).forEach((m, i) => {
        const marker = m.tipo === 'teoria_massimario' ? '📚' : m.tipo === 'nomofilachia_ssuu' ? '🏛️' : '  ';
        console.log(`| ${marker} ${i+1} | ${(m.boostedScore*100).toFixed(1)}% | ${(m.similarity*100).toFixed(1)}% | ${m.tipo} | ${(m.titolo || '').substring(0, 60)} |`);
    });

    console.log("\n📄 TOP CHUNK:");
    console.log("--------------------------------------------------");
    console.log(matches[0].content.substring(0, 800));
    console.log("--------------------------------------------------");
}

testLive();
