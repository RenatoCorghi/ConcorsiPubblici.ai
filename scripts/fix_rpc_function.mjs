import pg from 'pg';
const { Client } = pg;
import fs from 'fs';

fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
});

const client = new Client({
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    port: 5432, database: 'postgres',
    user: 'postgres.wggjfuqsjqwptuprutza',
    password: 'Concorsipoli21!',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 0,
});

await client.connect();
console.log('Connesso!\n');

// v6: Aggiunge filtro PQM a livello DB
// Chunk corti (<600 chars) che iniziano con P.Q.M. sono dispositivi inutili
console.log('🔧 v6 — Filtro PQM a livello DB...\n');

await client.query(`
    CREATE OR REPLACE FUNCTION match_documents_hybrid(
        query_embedding vector(768),
        query_text text DEFAULT '',
        match_count int DEFAULT 5,
        match_threshold float DEFAULT 0.5,
        filter_materia text DEFAULT NULL,
        filter_tipo text DEFAULT NULL,
        filter_tier int DEFAULT NULL,
        filter_anno_min int DEFAULT NULL
    )
    RETURNS TABLE(
        id uuid,
        document_id uuid,
        content text,
        materia text,
        tipo text,
        titolo text,
        similarity float,
        keyword_score float,
        hybrid_score float
    )
    LANGUAGE plpgsql
    AS $$
    DECLARE
        ts_query tsquery;
        subset_size int;
        use_sequential boolean := false;
    BEGIN
        IF query_text IS NOT NULL AND query_text <> '' THEN
            BEGIN
                ts_query := websearch_to_tsquery('italian', query_text);
            EXCEPTION WHEN OTHERS THEN
                ts_query := NULL;
            END;
        ELSE
            ts_query := NULL;
        END IF;

        SELECT count(*) INTO subset_size
        FROM rag_chunks c
        WHERE (filter_materia IS NULL OR c.materia = filter_materia OR c.materia IS NULL)
          AND (filter_tier IS NULL OR c.tier = filter_tier)
          AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
          AND c.embedding IS NOT NULL;

        use_sequential := (subset_size < 15000);

        IF use_sequential THEN
            RETURN QUERY
            WITH small_pool AS (
                SELECT c.id, c.document_id, c.content, c.materia, c.tipo, c.fts,
                    (1 - (c.embedding <=> query_embedding))::float AS sim
                FROM rag_chunks c
                WHERE (filter_materia IS NULL OR c.materia = filter_materia OR c.materia IS NULL)
                  AND (filter_tipo IS NULL OR c.tipo = filter_tipo)
                  AND (filter_tier IS NULL OR c.tier = filter_tier)
                  AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
                  AND c.embedding IS NOT NULL
                  -- FILTRO PQM: escludi dispositivi corti
                  AND NOT (length(c.content) < 600 AND (
                      c.content ILIKE 'P.Q.M.%' OR c.content ILIKE 'P. Q. M.%'
                      OR c.content ILIKE '%P.Q.M.%dichiara%' OR c.content ILIKE '%P.Q.M.%rigetta%'
                      OR c.content ILIKE '%P.Q.M.%accoglie%' OR c.content ILIKE '%P.Q.M.%cassa%'
                  ))
            )
            SELECT sp.id, sp.document_id, sp.content, sp.materia, sp.tipo,
                d.titolo, sp.sim,
                CASE WHEN ts_query IS NOT NULL AND sp.fts IS NOT NULL
                    THEN ts_rank_cd(sp.fts, ts_query, 32)::float ELSE 0.0
                END AS keyword_score,
                (0.7 * sp.sim +
                 0.3 * CASE WHEN ts_query IS NOT NULL AND sp.fts IS NOT NULL
                    THEN ts_rank_cd(sp.fts, ts_query, 32)::float ELSE 0.0
                 END)::float AS hybrid_score
            FROM small_pool sp
            LEFT JOIN rag_documents d ON d.id = sp.document_id
            WHERE sp.sim >= match_threshold
            ORDER BY hybrid_score DESC
            LIMIT match_count;
        ELSE
            PERFORM set_config('hnsw.ef_search', 
                CASE 
                    WHEN subset_size < 50000 THEN '400'
                    WHEN subset_size < 150000 THEN '200'
                    ELSE '100'
                END, true);
            
            RETURN QUERY
            SELECT 
                c.id, c.document_id, c.content, c.materia, c.tipo,
                d.titolo,
                (1 - (c.embedding <=> query_embedding))::float AS similarity,
                CASE WHEN ts_query IS NOT NULL AND c.fts IS NOT NULL
                    THEN ts_rank_cd(c.fts, ts_query, 32)::float ELSE 0.0
                END AS keyword_score,
                (0.7 * (1 - (c.embedding <=> query_embedding))::float +
                 0.3 * CASE WHEN ts_query IS NOT NULL AND c.fts IS NOT NULL
                    THEN ts_rank_cd(c.fts, ts_query, 32)::float ELSE 0.0
                 END)::float AS hybrid_score
            FROM rag_chunks c
            LEFT JOIN rag_documents d ON d.id = c.document_id
            WHERE (filter_materia IS NULL OR c.materia = filter_materia OR c.materia IS NULL)
              AND (filter_tipo IS NULL OR c.tipo = filter_tipo)
              AND (filter_tier IS NULL OR c.tier = filter_tier)
              AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
              AND (1 - (c.embedding <=> query_embedding))::float >= match_threshold
              -- FILTRO PQM: escludi dispositivi corti
              AND NOT (length(c.content) < 600 AND (
                  c.content ILIKE 'P.Q.M.%' OR c.content ILIKE 'P. Q. M.%'
                  OR c.content ILIKE '%P.Q.M.%dichiara%' OR c.content ILIKE '%P.Q.M.%rigetta%'
                  OR c.content ILIKE '%P.Q.M.%accoglie%' OR c.content ILIKE '%P.Q.M.%cassa%'
              ))
            ORDER BY c.embedding <=> query_embedding
            LIMIT match_count;
        END IF;
    END;
    $$;
`);
console.log('✅ Funzione v6 deployata!\n');

// Test
const gkey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
async function embed(text) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${gkey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/gemini-embedding-2', content: { parts: [{ text }] }, outputDimensionality: 768 })
    });
    return (await r.json()).embedding?.values;
}

const tests = [
    { q: 'Simulazione del contratto interposizione fittizia', m: 'Diritto Civile', t: 1, a: null },
    { q: 'Danno non patrimoniale', m: 'Diritto Civile', t: 1, a: null },
    { q: 'Autotutela amministrativa riforma Madia', m: 'Diritto Amministrativo', t: 1, a: null },
    { q: 'Simulazione relativa soggettiva', m: 'Diritto Civile', t: 2, a: 2022 },
    { q: 'Eccesso di potere e sviamento', m: 'Diritto Amministrativo', t: 2, a: 2024 },
    { q: 'Concorso di persone nel reato', m: 'Diritto Penale', t: 2, a: 2023 },
    { q: 'Responsabilità PA danno da ritardo', m: 'Diritto Amministrativo', t: 2, a: 2024 },
    { q: 'Legittimo affidamento e autotutela', m: 'Diritto Amministrativo', t: 2, a: 2022 },
];

for (const t of tests) {
    const v = await embed(`${t.m}: ${t.q}`);
    if (!v) continue;
    const s = Date.now();
    let sql = `SELECT content, similarity, hybrid_score FROM match_documents_hybrid(
        query_embedding := $1::vector, query_text := $2,
        match_count := 5, match_threshold := 0.50,
        filter_materia := $3, filter_tier := $4`;
    const params = [`[${v.join(',')}]`, t.q, t.m, t.t];
    if (t.a) { sql += `, filter_anno_min := $5`; params.push(t.a); }
    sql += `)`;
    const res = await client.query({ text: sql, values: params, statement_timeout: 30000 });
    const ms = Date.now() - s;
    const pqm = res.rows.filter(r => (r.content||'').toLowerCase().includes('p.q.m')).length;
    const icon = res.rows.length > 0 ? (pqm === 0 ? '✅' : (pqm < res.rows.length ? '🟡' : '🟠')) : '🔴';
    console.log(`  ${icon} [${ms}ms] T${t.t}${t.a ? ' '+t.a+'+' : ''} ${t.m.replace('Diritto ','')} "${t.q.substring(0,42)}" → ${res.rows.length} (${pqm} PQM)`);
    if (res.rows.length > 0) {
        console.log(`     [sim=${res.rows[0].similarity?.toFixed(3)}] ${(res.rows[0].content||'').substring(0, 140).replace(/\n/g, ' ')}...`);
    }
}

await client.end();
console.log('\nFatto!');
