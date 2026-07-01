/**
 * run_migration_014.mjs — Esegue la migration 014 (versioni corpus per
 * cache semantica) su Supabase via connessione Postgres diretta.
 *
 * Credenziali da .env (SUPABASE_DB_HOST/USER/PASSWORD) — mai hardcodarle.
 * Uso: node scripts/migrations/run_migration_014.mjs
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

const sqlFile = path.resolve('scripts/migrations/014_semcache_versions.sql');
const segments = fs.readFileSync(sqlFile, 'utf8')
    .split(/^-- ===SPLIT===$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !/^(--.*\n?)+$/.test(s + '\n'));

console.log('\n🗄️  Migration 014 — Versioni corpus per cache semantica');
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
    const stats = await client.query(`SELECT family, chunk_count, version FROM rag_family_stats ORDER BY chunk_count DESC`);
    console.log('\n📊 rag_family_stats con versioni:');
    stats.rows.forEach(r => console.log(`   ${r.family.padEnd(18)} chunk=${String(r.chunk_count).padStart(6)} version=${r.version}`));

    const col = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'rag_quality_log' AND column_name = 'cache_status'`);
    console.log(`\n🔧 rag_quality_log.cache_status: ${col.rows.length > 0 ? 'presente' : '❌ MANCANTE'}`);
    console.log('\n✅ Migration 014 completata.');
} finally {
    await client.end();
}
