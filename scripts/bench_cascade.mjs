/**
 * bench_cascade.mjs — Benchmark match_documents_cascade (migration 013)
 * contro match_documents_hybrid (baseline live, migration 010) e
 * match_documents_exact (ground truth a scan completo).
 *
 * Misura per ogni query:
 *   - recall@8 vs exact (stessa formula ibrida 0.7/0.3, senza ANN)
 *   - latenza server-side (Execution Time da EXPLAIN ANALYZE: esclude RTT)
 * Le query replicano il comportamento del proxy: prefisso materia
 * nell'embedding, match_count=8, threshold=0.40.
 *
 * Uso: node scripts/bench_cascade.mjs
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
});

const GEMINI_KEY = env.GEMINI_API_KEY || env.GOOGLE_AI_KEY;
const QUERY_TASK_TYPE = env.RAG_QUERY_TASK_TYPE || null;

const client = new pg.Client({
    host: env.SUPABASE_DB_HOST,
    port: 5432,
    database: 'postgres',
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 0,
});

// Query realistiche (dalla tassonomia del proxy + titoli tipo lezione).
// materia=null → subset 35K → path cascata; materia valorizzata → subset
// piccolo → path esatto identico (sanity check di non-regressione).
const BENCH_SET = [
    { q: 'Il contratto simulato e in frode alla legge, con riferimento al contratto di società', materia: null },
    { q: 'La responsabilità precontrattuale della pubblica amministrazione', materia: null },
    { q: 'dolo eventuale colpa cosciente Sezioni Unite Thyssen confine', materia: null },
    { q: 'azione revocatoria ordinaria art 2901 c.c. presupposti eventus damni', materia: null },
    { q: 'silenzio assenso art 20 legge 241/1990 presupposti limiti', materia: null },
    { q: 'concorso di persone nel reato art 110 c.p. elementi strutturali', materia: null },
    { q: 'danno non patrimoniale biologico morale esistenziale Sezioni Unite San Martino', materia: null },
    { q: 'eccesso di potere figure sintomatiche sviamento', materia: null },
    { q: 'principi contratti pubblici codice 36/2023 trasparenza concorrenza', materia: null },
    { q: 'la compensatio lucri cum damno nel risarcimento del danno', materia: null },
    { q: 'accertamento tributario contraddittorio endoprocedimentale obbligatorio', materia: null },
    { q: 'responsabilità medica colpa grave linee guida legge Gelli-Bianco', materia: null },
    { q: 'legittima difesa art 52 c.p. proporzionalità', materia: 'Diritto Penale' },
    { q: 'tentativo art 56 c.p. idoneità univocità degli atti', materia: 'Diritto Penale' },
    { q: 'simulazione assoluta relativa art 1414 c.c. effetti tra parti e terzi', materia: 'Diritto Civile' },
    { q: 'inadempimento obbligazione art 1218 c.c. impossibilità sopravvenuta', materia: 'Diritto Civile' },
    { q: "autotutela annullamento d'ufficio art 21-nonies limiti temporali", materia: 'Diritto Amministrativo' },
    { q: 'giurisdizione esclusiva del giudice amministrativo servizi pubblici', materia: 'Diritto Amministrativo' },
    { q: 'statuto del contribuente affidamento buona fede art 10', materia: 'Diritto Tributario' },
    { q: 'concussione induzione indebita Sezioni Unite Maldera differenze', materia: 'Diritto Processuale Penale' },
];

const K = 8;
const THRESHOLD = 0.40;
const TIMED_RUNS = 5;

async function embed(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text }] },
            outputDimensionality: 768,
            ...(QUERY_TASK_TYPE ? { taskType: QUERY_TASK_TYPE } : {})
        })
    });
    const data = await res.json();
    if (!data.embedding?.values) throw new Error('Embed fallito: ' + JSON.stringify(data).substring(0, 200));
    return data.embedding.values;
}

// Dollar-quoting per i literal testuali; il vettore è solo numeri.
const lit = (s) => s === null ? 'NULL' : `$bench$${s}$bench$`;

function fnCall(fn, vec, q, materia) {
    return `SELECT * FROM ${fn}('[${vec.join(',')}]'::vector(768), ${lit(q)}, ${K}, ${THRESHOLD}, ${lit(materia)})`;
}

async function timedRuns(sql) {
    const times = [];
    await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`); // warm-up
    for (let i = 0; i < TIMED_RUNS; i++) {
        const r = await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`);
        times.push(r.rows[0]['QUERY PLAN'][0]['Execution Time']);
    }
    times.sort((a, b) => a - b);
    return { median: times[Math.floor(times.length / 2)], min: times[0], max: times[times.length - 1] };
}

const pct = (x) => (100 * x).toFixed(1) + '%';
const results = [];

await client.connect();
try {
    for (const { q, materia } of BENCH_SET) {
        const prefix = materia ? `${materia}: ` : '';
        const vec = await embed(prefix + q);

        const exactIds = (await client.query(fnCall('match_documents_exact', vec, q, materia))).rows.map(r => r.id);
        const row = { query: q.substring(0, 55), materia: materia || '(tutte)' };

        for (const [label, fn] of [['hybrid', 'match_documents_hybrid'], ['cascade', 'match_documents_cascade']]) {
            const sql = fnCall(fn, vec, q, materia);
            const ids = (await client.query(sql)).rows.map(r => r.id);
            const t = await timedRuns(sql);
            const hits = ids.filter(id => exactIds.includes(id)).length;
            row[`${label}_recall`] = exactIds.length > 0 ? hits / exactIds.length : 1;
            row[`${label}_ms`] = t.median;
            row[`${label}_ids`] = ids;
        }
        row.exact_n = exactIds.length;
        results.push(row);
        console.log(`✓ ${row.materia.padEnd(28)} ${row.query.padEnd(57)} hybrid ${row.hybrid_ms.toFixed(0).padStart(5)}ms r=${pct(row.hybrid_recall).padStart(6)} | cascade ${row.cascade_ms.toFixed(0).padStart(5)}ms r=${pct(row.cascade_recall).padStart(6)}`);
    }

    // Aggregati, separando il path grande (materia null) dal path piccolo
    const agg = (rows, label) => {
        const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
        const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
        console.log(`\n── ${label} (${rows.length} query) ──`);
        for (const fn of ['hybrid', 'cascade']) {
            console.log(`${fn.padEnd(8)} recall@${K} medio ${pct(mean(rows.map(r => r[`${fn}_recall`])))} | latenza server mediana ${med(rows.map(r => r[`${fn}_ms`])).toFixed(1)}ms | max ${Math.max(...rows.map(r => r[`${fn}_ms`])).toFixed(1)}ms`);
        }
    };
    agg(results.filter(r => r.materia === '(tutte)'), 'PATH CASCATA (senza filtro materia, subset 35K)');
    agg(results.filter(r => r.materia !== '(tutte)'), 'PATH ESATTO (con filtro materia, subset <15K — atteso identico)');

    const idx = await client.query(`
        SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS size,
               pg_relation_size(indexname::regclass) AS bytes
        FROM pg_indexes
        WHERE indexname IN ('idx_rag_chunks_embedding_bq', 'idx_rag_chunks_embedding_hnsw')`);
    console.log('\n── MEMORIA INDICI ──');
    idx.rows.forEach(r => console.log(`${r.indexname}: ${r.size}`));
    const b = Object.fromEntries(idx.rows.map(r => [r.indexname, Number(r.bytes)]));
    if (b.idx_rag_chunks_embedding_bq && b.idx_rag_chunks_embedding_hnsw) {
        console.log(`Riduzione: ${(b.idx_rag_chunks_embedding_hnsw / b.idx_rag_chunks_embedding_bq).toFixed(1)}× (${pct(1 - b.idx_rag_chunks_embedding_bq / b.idx_rag_chunks_embedding_hnsw)} in meno)`);
    }

    const out = process.argv[2] || path.resolve('scripts', 'bench_cascade_results.json');
    fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), task_type: QUERY_TASK_TYPE, k: K, threshold: THRESHOLD, results }, null, 2));
    console.log(`\n💾 Risultati salvati in ${out}`);
} finally {
    await client.end();
}
