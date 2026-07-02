/**
 * run_migration_015.mjs — Esegue la migration 015 (metriche latenza e
 * compressione su rag_quality_log) su Supabase via Postgres diretto.
 *
 * Credenziali da .env (SUPABASE_DB_HOST/USER/PASSWORD) — mai hardcodarle.
 * Uso: node scripts/migrations/run_migration_015.mjs
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

const sqlFile = path.resolve('scripts/migrations/015_quality_log_metrics.sql');
const segments = fs.readFileSync(sqlFile, 'utf8')
    .split(/^-- ===SPLIT===$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !/^(--.*\n?)+$/.test(s + '\n'));

console.log('\n🗄️  Migration 015 — Metriche latenza/compressione su rag_quality_log');
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

    const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'rag_quality_log'
          AND column_name IN ('retrieval_ms', 'context_chars_in', 'context_chars_out', 'degradations')
        ORDER BY column_name`);
    console.log('\n🔧 Colonne aggiunte:', cols.rows.map(r => r.column_name).join(', ') || '❌ NESSUNA');
    console.log('\n✅ Migration 015 completata.');
} finally {
    await client.end();
}
