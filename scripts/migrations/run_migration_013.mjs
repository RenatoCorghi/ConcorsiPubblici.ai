/**
 * run_migration_013.mjs — Esegue la migration 013 (cascata binaria) su Supabase.
 *
 * Connessione diretta Postgres via pooler (session mode): il CREATE INDEX può
 * superare i timeout REST, quindi niente exec_sql. Le credenziali vengono da
 * .env (SUPABASE_DB_HOST/USER/PASSWORD) — mai hardcodarle negli script.
 *
 * Uso: node scripts/migrations/run_migration_013.mjs
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

if (!env.SUPABASE_DB_HOST || !env.SUPABASE_DB_USER || !env.SUPABASE_DB_PASSWORD) {
    console.error('❌ SUPABASE_DB_HOST, SUPABASE_DB_USER e SUPABASE_DB_PASSWORD richiesti nel .env');
    process.exit(1);
}

const client = new pg.Client({
    host: env.SUPABASE_DB_HOST,
    port: 5432,
    database: 'postgres',
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 0,
});

const sqlFile = path.resolve('scripts/migrations/013_cascade_binary_index.sql');
const segments = fs.readFileSync(sqlFile, 'utf8')
    .split(/^-- ===SPLIT===$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !/^(--.*\n?)+$/.test(s + '\n'));

console.log('\n🗄️  Migration 013 — Cascata di quantizzazione binaria');
console.log('━'.repeat(55));
console.log(`📂 SQL: ${sqlFile} (${segments.length} blocchi)\n`);

await client.connect();
try {
    for (let i = 0; i < segments.length; i++) {
        const firstLine = segments[i].split('\n').find(l => l.trim() && !l.trim().startsWith('--')) || '';
        const start = Date.now();
        await client.query(segments[i]);
        console.log(`✅ Blocco ${i + 1}/${segments.length} (${((Date.now() - start) / 1000).toFixed(1)}s): ${firstLine.substring(0, 70)}`);
    }

    // Verifiche post-migrazione
    const idx = await client.query(`
        SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS size
        FROM pg_indexes
        WHERE tablename = 'rag_chunks' AND indexname IN ('idx_rag_chunks_embedding_bq', 'idx_rag_chunks_embedding_hnsw')
        ORDER BY indexname`);
    console.log('\n📏 Confronto indici (binario vs float):');
    idx.rows.forEach(r => console.log(`   ${r.indexname}: ${r.size}`));

    const fns = await client.query(`
        SELECT proname, pg_get_function_identity_arguments(oid) AS args
        FROM pg_proc
        WHERE proname IN ('match_documents_cascade', 'match_documents_exact')
          AND pronamespace = 'public'::regnamespace`);
    console.log('\n🔧 Funzioni create:');
    fns.rows.forEach(r => console.log(`   ${r.proname}(${r.args.substring(0, 90)}…)`));
    console.log('\n✅ Migration 013 completata.');
} finally {
    await client.end();
}
