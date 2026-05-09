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

const TESTS = [
    {
        name: "TEST 1 — SOCCORSO ISTRUTTORIO",
        query: "Professore, vorrei affrontare l'aporia del soccorso istruttorio nei contratti pubblici (art. 101 D.Lgs. 36/2023). Come si contempera l'esigenza di massima partecipazione con il limite invalicabile della par condicio? Qual è il 'punto di caduta' dogmatico che separa la mera irregolarità formale, sempre sanabile, dall'inammissibile modificazione sostanziale dell'offerta tecnica?"
    },
    {
        name: "TEST 2 — ANNULLAMENTO D'UFFICIO E AFFIDAMENTO",
        query: "In tema di annullamento d'ufficio di un titolo abilitativo illegittimo, come si inquadra dogmaticamente la responsabilità della P.A. per la lesione dell'affidamento incolpevole del privato? Soprattutto, alla luce dei più recenti e contrastanti arresti delle Sezioni Unite della Cassazione, questa fattispecie genera una controversia risarcitoria attratta nella giurisdizione del Giudice Ordinario o del Giudice Amministrativo?"
    },
    {
        name: "TEST 3 — ACCESSO DIFENSIVO vs FOIA",
        query: "Un operatore economico, arrivato secondo, si vede negare l'accesso difensivo (ex L. 241/90) all'offerta tecnica del vincitore per questioni di segreto industriale. Può questo operatore aggirare l'ostacolo utilizzando l'accesso civico generalizzato (FOIA ex D.lgs. 33/2013) con finalità puramente 'esplorative'? Come ha risolto la giurisprudenza superiore questa forzatura concettuale?"
    },
    {
        name: "TEST 4 — SCIA E TUTELA DEL TERZO",
        query: "Se il vicino di casa segnala un abuso edilizio in corso tramite SCIA, ma il Comune lascia spirare inutilmente il termine per l'esercizio del potere inibitorio, il potere della P.A. si consuma definitivamente? Quali anelli intermedi e strumenti processuali restano al terzo controinteressato per non veder vanificata la propria tutela avverso il silenzio dell'amministrazione?"
    }
];

const BOOST = {
    'teoria_massimario': 1.35,
    'massimario_cassazione': 1.30,
    'nomofilachia_ssuu': 1.25,
    'sentenza_ssuu': 1.20
};

const ICONS = {
    'teoria_massimario': '📚 RIVISTA',
    'massimario_cassazione': '📖 MASSIMARIO',
    'nomofilachia_ssuu': '🏛️ NOMO',
    'sentenza_ssuu': '⚖️ SS.UU.',
    'codice': '📜 CODICE',
    'sentenza': '📄 SENTENZA',
    'sentenza_admin': '📄 SENT.GA'
};

async function runTest(test) {
    console.log('\n' + '═'.repeat(80));
    console.log(`  ${test.name}`);
    console.log('═'.repeat(80));
    console.log(`Query: "${test.query.substring(0, 100)}..."\n`);

    const vector = await getEmbedding(test.query);

    // 5 ricerche parallele (come il proxy)
    const [std, riv, nomo, ssuu, mass] = await Promise.all([
        supabase.rpc('match_rag_chunks', { query_embedding: vector, match_threshold: 0.55, match_count: 10 }),
        supabase.rpc('match_rag_chunks_by_tipo', { query_embedding: vector, match_threshold: 0.40, match_count: 3, filter_tipo: 'teoria_massimario' }),
        supabase.rpc('match_rag_chunks_by_tipo', { query_embedding: vector, match_threshold: 0.40, match_count: 2, filter_tipo: 'nomofilachia_ssuu' }),
        supabase.rpc('match_rag_chunks_by_tipo', { query_embedding: vector, match_threshold: 0.40, match_count: 2, filter_tipo: 'sentenza_ssuu' }),
        supabase.rpc('match_rag_chunks_by_tipo', { query_embedding: vector, match_threshold: 0.40, match_count: 2, filter_tipo: 'massimario_cassazione' })
    ]);

    if (std.error) { console.log('❌ ERRORE:', std.error.message); return; }

    // Merge + dedup
    const seen = new Set();
    const matches = [];
    for (const m of [...(std.data||[]), ...(riv.data||[]), ...(nomo.data||[]), ...(ssuu.data||[]), ...(mass.data||[])]) {
        if (!seen.has(m.id)) {
            seen.add(m.id);
            m.boostedScore = m.similarity * (BOOST[m.tipo] || 1.0);
            matches.push(m);
        }
    }
    matches.sort((a, b) => b.boostedScore - a.boostedScore);

    // Stats
    console.log(`📊 RETRIEVAL: Std=${std.data?.length||0} Riv=${riv.data?.length||0} Nomo=${nomo.data?.length||0} SSUU=${ssuu.data?.length||0} Mass=${mass.data?.length||0} → Merged: ${matches.length}\n`);

    // Top 8 (come il proxy manda all'AI)
    const top = matches.slice(0, 8);
    console.log('🏆 TOP 8 (quello che vede l\'AI):');
    console.log('─'.repeat(80));
    top.forEach((m, i) => {
        const icon = ICONS[m.tipo] || m.tipo;
        const title = (m.titolo || '').substring(0, 55);
        console.log(`  ${i+1}. ${icon} | Boost ${(m.boostedScore*100).toFixed(1)}% (sim ${(m.similarity*100).toFixed(1)}%) | ${title}`);
    });

    // Content preview dei top 3
    console.log('\n📝 PREVIEW CONTENUTO TOP 3:');
    top.slice(0, 3).forEach((m, i) => {
        const icon = ICONS[m.tipo] || m.tipo;
        console.log(`\n  ── Fonte ${i+1}: ${icon} ──`);
        const clean = m.content
            .replace(/\b20\d{7,}\b/g, '[cod.reg]')
            .substring(0, 400)
            .replace(/\n/g, '\n  ');
        console.log(`  ${clean}...`);
    });
    console.log();
}

async function main() {
    console.log('🔬 TEST D\'ASSALTO RAG — 4 DOMANDE DA CONCORSO');
    console.log('Pipeline: 5 ricerche parallele → merge → boost → top 8\n');

    for (const test of TESTS) {
        await runTest(test);
        await new Promise(r => setTimeout(r, 500)); // Rate limit
    }

    console.log('═'.repeat(80));
    console.log('  FINE TEST');
    console.log('═'.repeat(80));
}

main();
