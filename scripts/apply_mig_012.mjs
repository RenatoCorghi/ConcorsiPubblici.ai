import pg from 'pg';
const { Client } = pg;
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(l => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) envVars[m[1].trim()] = m[2].trim(); });
const projectRef = (envVars.SUPABASE_URL || '').match(/https:\/\/([^.]+)\./)?.[1];

const client = new Client({
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${projectRef}`,
    password: envVars.SUPABASE_DB_PASSWORD || 'Concorsipoli21!',
    ssl: { rejectUnauthorized: false }
});

async function run() {
    await client.connect();
    console.log("🚀 Esecuzione Migration 012 in corso...");
    
    try {
        const sql = fs.readFileSync('scripts/migrations/012_rag_quality_log.sql', 'utf-8');
        await client.query(sql);
        console.log("✅ Migration 012 applicata con successo!");
    } catch(e) {
        console.error("❌ Errore durante l'esecuzione:", e);
    } finally {
        await client.end();
    }
}
run();
