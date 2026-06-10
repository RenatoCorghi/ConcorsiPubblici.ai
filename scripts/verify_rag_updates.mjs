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
    
    try {
        const statsRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'rag_family_stats'
        `);
        if (statsRes.rowCount > 0) {
            console.log("✅ Tabella 'rag_family_stats' presente (Migration 011 applicata).");
            const countStats = await client.query(`SELECT family, chunk_count FROM rag_family_stats`);
            console.log("   Statistiche attuali:");
            countStats.rows.forEach(r => console.log(`   - ${r.family}: ${r.chunk_count} chunks`));
        } else {
            console.log("❌ Tabella 'rag_family_stats' NON trovata.");
        }
    } catch(e) {
        console.error("Errore durante la verifica:", e);
    } finally {
        await client.end();
    }
}
run();
