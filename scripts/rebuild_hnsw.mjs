/**
 * REBUILD HNSW — eseguire da dentro il progetto
 */
import pg from 'pg';
const { Client } = pg;

// Leggi l'URL dal .env e ricava l'host
import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(l => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) envVars[m[1].trim()] = m[2].trim(); });

const projectRef = (envVars.SUPABASE_URL || '').match(/https:\/\/([^.]+)\./)?.[1];
// Prova diversi formati di hostname Supabase
const hosts = [
    `db.${projectRef}.supabase.co`,
    `${projectRef}.supabase.co`,
    `aws-0-eu-central-1.pooler.supabase.com`,
];

let client;
for (const host of hosts) {
    console.log(`🔍 Provo: ${host}...`);
    const opts = {
        host,
        port: host.includes('pooler') ? 6543 : 5432,
        database: 'postgres',
        user: host.includes('pooler') ? `postgres.${projectRef}` : 'postgres',
        password: 'Concorsipoli21!',
        ssl: { rejectUnauthorized: false },
        statement_timeout: 0,
        connectionTimeoutMillis: 10000,
    };
    try {
        client = new Client(opts);
        await client.connect();
        console.log(`✅ Connesso a ${host}!`);
        break;
    } catch(e) {
        console.log(`   ❌ ${e.message.substring(0, 80)}`);
        client = null;
    }
}
if (!client) { console.error('❌ Impossibile connettersi'); process.exit(1); }

try {
    console.log('');

    const countRes = await client.query(`SELECT count(*) FROM rag_chunks WHERE embedding IS NOT NULL`);
    console.log(`📊 Righe con embedding: ${countRes.rows[0].count}\n`);

    console.log('🗑️ Drop indice HNSW...');
    await client.query(`DROP INDEX IF EXISTS idx_rag_chunks_embedding_hnsw`);
    console.log('   ✅ Eliminato\n');

    console.log('🔧 Rebuild HNSW (può richiedere minuti)...');
    const start = Date.now();
    await client.query(`
        CREATE INDEX idx_rag_chunks_embedding_hnsw
        ON rag_chunks USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);
    console.log(`✅ Ricostruito in ${((Date.now() - start) / 1000).toFixed(1)}s!\n`);

    console.log('🧹 VACUUM ANALYZE...');
    await client.query('VACUUM ANALYZE rag_chunks');
    console.log('   ✅ Done\n');

    const allIdx = await client.query(`SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) as size FROM pg_indexes WHERE tablename = 'rag_chunks' ORDER BY indexname`);
    console.log('📋 Indici:');
    for (const row of allIdx.rows) console.log(`   ${row.indexname} (${row.size})`);

    console.log('\n🏁 REBUILD COMPLETATO!');
} catch(e) {
    console.error('❌', e.message);
} finally {
    await client.end();
}
