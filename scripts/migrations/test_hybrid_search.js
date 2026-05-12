/**
 * test_hybrid_search.js
 * ============================================================
 * Testa la funzione match_documents_hybrid confrontandola
 * con la vecchia ricerca vector-only (match_rag_chunks).
 *
 * Esegui: node scripts/migrations/test_hybrid_search.js
 * ============================================================
 */

import path from 'path';
import fs from 'fs';

const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;

const RPC_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
};

// --- Query di test: 3 tipologie diverse ---
const TEST_QUERIES = [
    {
        label: '🏛️  Keyword precisa (articolo di legge)',
        text: 'art. 21 octies legge 241 1990 vizi formali annullabilità',
        materia: 'Diritto Amministrativo'
    },
    {
        label: '⚖️  Concetto giuridico astratto',
        text: 'eccesso di potere sviamento della causa tipica discrezionalità amministrativa',
        materia: null
    },
    {
        label: '📖  Termine tecnico Cassazione',
        text: 'Sezioni Unite riparto di giurisdizione giudice ordinario amministrativo',
        materia: null
    }
];

async function getEmbedding(text) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_KEY}`,
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
    return data.embedding?.values;
}

async function hybridSearch(vector, text, materia, count = 5) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_documents_hybrid`, {
        method: 'POST',
        headers: RPC_HEADERS,
        body: JSON.stringify({
            query_embedding: vector,
            query_text: text,
            match_count: count,
            match_threshold: 0.25,
            filter_materia: materia || undefined
        })
    });
    if (!res.ok) throw new Error(`Hybrid RPC ${res.status}: ${await res.text()}`);
    return res.json();
}

async function vectorOnlySearch(vector, count = 5) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_rag_chunks`, {
        method: 'POST',
        headers: RPC_HEADERS,
        body: JSON.stringify({
            query_embedding: vector,
            match_count: count,
            match_threshold: 0.25
        })
    });
    if (!res.ok) throw new Error(`Vector RPC ${res.status}: ${await res.text()}`);
    return res.json();
}

async function main() {
    console.log('\n🔀 Test Hybrid Search vs Vector-Only');
    console.log('═'.repeat(65));

    for (const query of TEST_QUERIES) {
        console.log(`\n${query.label}`);
        console.log(`📝 Query: "${query.text.substring(0, 60)}..."`);
        if (query.materia) console.log(`🏷️  Filtro materia: ${query.materia}`);
        console.log('─'.repeat(65));

        // Genera embedding
        const vector = await getEmbedding(query.text);
        if (!vector) { console.error('❌ Embedding fallito'); continue; }

        // Lancia entrambe in parallelo
        const [hybridResults, vectorResults] = await Promise.all([
            hybridSearch(vector, query.text, query.materia),
            vectorOnlySearch(vector)
        ]);

        // Confronta top-3
        console.log('\n  🔀 HYBRID (vector 70% + keyword 30%):');
        (hybridResults || []).slice(0, 3).forEach((r, i) => {
            const sem = (r.similarity * 100).toFixed(1);
            const kw = ((r.keyword_score || 0) * 100).toFixed(4);
            const hy = (r.hybrid_score * 100).toFixed(1);
            const title = (r.content?.substring(0, 55) || '?');
            console.log(`  ${i+1}. [sem:${sem}% kw:${kw}% → hybrid:${hy}%] ${title}`);
        });

        console.log('\n  🔍 VECTOR-ONLY (solo coseno):');
        (vectorResults || []).slice(0, 3).forEach((r, i) => {
            const sim = ((r.similarity || 0) * 100).toFixed(1);
            const title = (r.titolo || r.content?.substring(0, 50) || '?').substring(0, 55);
            console.log(`  ${i+1}. [sim:${sim}%] ${title}`);
        });

        // Conta risultati che cambiano tra i due approcci
        const hybridIds = new Set((hybridResults || []).map(r => r.id));
        const vectorIds = new Set((vectorResults || []).map(r => r.id));
        const overlap = [...hybridIds].filter(id => vectorIds.has(id)).length;
        const newInHybrid = hybridIds.size - overlap;
        console.log(`\n  📊 Sovrapposizione: ${overlap}/5 | Nuovi in Hybrid: ${newInHybrid}/5`);

        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n' + '═'.repeat(65));
    console.log('✅ Test completato!');
    console.log('💡 Se "Nuovi in Hybrid" > 0 su query con keywords precise,');
    console.log('   la hybrid search sta già migliorando il retrieval.\n');
}

main().catch(err => {
    console.error('💥 Errore:', err.message);
    process.exit(1);
});
