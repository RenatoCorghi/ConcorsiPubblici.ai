import pg from 'pg';
const { Client } = pg;

const client = new Client({
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.wggjfuqsjqwptuprutza',
    password: 'Concorsipoli21!',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,  // 30s timeout for EXPLAIN
});

await client.connect();
console.log('Connesso!\n');

// 1. Vedi la definizione della funzione
console.log('═══ DEFINIZIONE FUNZIONE match_documents_hybrid ═══\n');
const funcDef = await client.query(`
    SELECT proname, pronargs, proargtypes, prosrc 
    FROM pg_proc 
    WHERE proname = 'match_documents_hybrid' 
    ORDER BY pronargs
`);
for (const f of funcDef.rows) {
    console.log(`  Overload con ${f.pronargs} args`);
    console.log(`  Primi 300 chars: ${f.prosrc.substring(0, 300)}\n`);
}

// 2. EXPLAIN ANALYZE una query tipica che va in timeout
console.log('\n═══ EXPLAIN ANALYZE — Query Admin Tier 1 ═══\n');
try {
    // Crea un embedding finto di 768 dimensioni per il test
    const fakeEmbedding = Array(768).fill(0.01);
    
    const explain = await client.query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT c.id, c.content, c.materia, c.tipo, 
               1 - (c.embedding <=> $1::vector) as similarity
        FROM rag_chunks c
        WHERE c.materia = 'Diritto Amministrativo'
          AND c.tier = 1
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector
        LIMIT 5
    `, [`[${fakeEmbedding.join(',')}]`]);
    
    for (const row of explain.rows) {
        console.log('  ' + row['QUERY PLAN']);
    }
} catch (e) {
    console.log('  Errore:', e.message.substring(0, 200));
}

// 3. EXPLAIN ANALYZE con la funzione RPC effettiva
console.log('\n═══ EXPLAIN ANALYZE — Via RPC function ═══\n');
try {
    const fakeEmbedding = Array(768).fill(0.01);
    
    const explain = await client.query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT * FROM match_documents_hybrid(
            query_embedding := $1::vector,
            query_text := 'legittimo affidamento autotutela',
            match_count := 5,
            match_threshold := 0.50,
            filter_materia := 'Diritto Amministrativo',
            filter_tier := 1
        )
    `, [`[${fakeEmbedding.join(',')}]`]);
    
    for (const row of explain.rows) {
        console.log('  ' + row['QUERY PLAN']);
    }
} catch (e) {
    console.log('  Errore:', e.message.substring(0, 200));
}

// 4. Test indice HNSW diretto (senza CTE)
console.log('\n═══ EXPLAIN — Query diretta con indice HNSW ═══\n');
try {
    const fakeEmbedding = Array(768).fill(0.01);
    
    const explain = await client.query(`
        EXPLAIN (FORMAT TEXT)
        SELECT id, content, 1 - (embedding <=> $1::vector) as similarity
        FROM rag_chunks
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT 5
    `, [`[${fakeEmbedding.join(',')}]`]);
    
    for (const row of explain.rows) {
        console.log('  ' + row['QUERY PLAN']);
    }
} catch (e) {
    console.log('  Errore:', e.message.substring(0, 200));
}

// 5. Verifica tipo di indice
console.log('\n═══ DETTAGLI INDICI ═══\n');
const idxDetails = await client.query(`
    SELECT indexname, indexdef, pg_size_pretty(pg_relation_size(indexname::regclass)) as size
    FROM pg_indexes 
    WHERE tablename = 'rag_chunks' 
    AND (indexdef LIKE '%hnsw%' OR indexdef LIKE '%ivfflat%' OR indexdef LIKE '%vector%')
    ORDER BY indexname
`);
for (const row of idxDetails.rows) {
    console.log(`  ${row.indexname} (${row.size})`);
    console.log(`    ${row.indexdef}\n`);
}

await client.end();
