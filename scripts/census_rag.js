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
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'models/gemini-embedding-2', content: { parts: [{ text }] }, outputDimensionality: 768 }) }
    );
    return (await res.json()).embedding.values;
}

const tests = [
    { name: 'CODICI',           query: 'Art. 1218 codice civile responsabilità del debitore' },
    { name: 'SENTENZE GA',      query: 'annullamento permesso di costruire abuso edilizio TAR Lazio' },
    { name: 'SS.UU. CASSAZ.',   query: 'giurisdizione ordinaria o amministrativa responsabilità sanitaria' },
    { name: 'SENTENZE CDS',     query: 'procedura di gara appalto servizi esclusione requisiti' },
    { name: 'NOMOFILACHIA',     query: 'Sezioni Unite principio di diritto contratto preliminare' },
    { name: 'TEORIA/RIVISTE',   query: 'soccorso istruttorio offerta tecnica par condicio' },
];

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CENSIMENTO RAG - VERIFICA RETRIEVAL PER TIPO');
    console.log('═══════════════════════════════════════════════════════\n');

    for (const test of tests) {
        const v = await getEmbedding(test.query);
        
        // Ricerca standard
        const { data: std } = await supabase.rpc('match_rag_chunks', {
            query_embedding: v, match_threshold: 0.50, match_count: 5
        });
        
        // Ricerca teoria
        const { data: teo } = await supabase.rpc('match_rag_chunks_by_tipo', {
            query_embedding: v, match_threshold: 0.30, match_count: 2, filter_tipo: 'teoria_massimario'
        });
        
        // Ricerca nomofilachia
        const { data: nomo } = await supabase.rpc('match_rag_chunks_by_tipo', {
            query_embedding: v, match_threshold: 0.30, match_count: 2, filter_tipo: 'nomofilachia_ssuu'
        });

        // Breakdown del tipo nei risultati standard
        const tipoCount = {};
        (std || []).forEach(m => { tipoCount[m.tipo] = (tipoCount[m.tipo] || 0) + 1; });
        
        console.log(`🔍 ${test.name}`);
        console.log(`   Query: "${test.query.substring(0, 60)}..."`);
        console.log(`   Standard (top 5): ${Object.entries(tipoCount).map(([k,v]) => `${k}:${v}`).join(', ')}`);
        console.log(`   Teoria dedicata: ${teo?.length || 0} risultati${teo?.length ? ' → ' + (teo[0].similarity*100).toFixed(1) + '% ' + (teo[0].titolo||'').substring(0,50) : ''}`);
        console.log(`   Nomo dedicata:   ${nomo?.length || 0} risultati${nomo?.length ? ' → ' + (nomo[0].similarity*100).toFixed(1) + '% ' + (nomo[0].titolo||'').substring(0,50) : ''}`);
        console.log();
        
        await new Promise(r => setTimeout(r, 300));
    }
}

main();
