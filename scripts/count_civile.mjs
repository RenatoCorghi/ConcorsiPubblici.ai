import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const envFile = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(l => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) envVars[m[1].trim()] = m[2].trim(); });

const client = new Client({
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.wggjfuqsjqwptuprutza',
    password: 'Concorsipoli21!',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 0,
});

async function main() {
    await client.connect();
    const res = await client.query(`
        SELECT tipo, count(*) as c 
        FROM rag_chunks 
        WHERE tipo IN ('vip_notariato', 'vip_dottrina_oa', 'vip_corte_costituzionale') 
        GROUP BY tipo
    `);
    console.log("Statistiche VIP Civile:");
    console.table(res.rows);
    await client.end();
}
main().catch(console.error);
