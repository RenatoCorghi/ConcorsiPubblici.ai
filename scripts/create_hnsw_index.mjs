import pg from 'pg';
const { Client } = pg;

// Usa il pooler Supabase (IPv4) in session mode (port 5432)
const client = new Client({
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.wggjfuqsjqwptuprutza',
    password: 'Concorsipoli21!',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 0,
});

try {
    console.log('Connessione...');
    await client.connect();
    console.log('Connesso!');

    const countRes = await client.query('SELECT count(*) FROM rag_chunks WHERE embedding IS NOT NULL');
    console.log('Righe con embedding:', countRes.rows[0].count);

    const idxRes = await client.query("SELECT indexname FROM pg_indexes WHERE tablename = 'rag_chunks' AND indexdef LIKE '%hnsw%'");
    if (idxRes.rows.length > 0) {
        console.log('Indice HNSW gia esistente:', idxRes.rows[0].indexname);
    } else {
        console.log('Creazione indice HNSW... (2-10 minuti)');
        const start = Date.now();
        await client.query('CREATE INDEX idx_rag_chunks_embedding_hnsw ON rag_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)');
        console.log('Indice HNSW creato in', ((Date.now() - start) / 1000).toFixed(1) + 's');
    }

    const allIdx = await client.query("SELECT indexname FROM pg_indexes WHERE tablename = 'rag_chunks' ORDER BY indexname");
    console.log('Indici su rag_chunks:', allIdx.rows.map(r => r.indexname).join(', '));
} catch (err) {
    console.error('Errore:', err.message);
} finally {
    await client.end();
}
