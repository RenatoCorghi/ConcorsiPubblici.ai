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
    password: 'Concorsipoli21!',
    ssl: { rejectUnauthorized: false }
});

async function run() {
    await client.connect();
    try {
        const query = "SELECT content FROM rag_chunks WHERE content ILIKE '%28994%' LIMIT 5";
        const res = await client.query(query);
        console.log("Risultati trovati per 28994 in rag_chunks:", res.rows.length);
        if (res.rows.length > 0) {
             console.log(res.rows[0].content.substring(0, 500));
        }
    } catch(e) {
        console.error("Errore rag_chunks:", e.message);
    }
    
    try {
        const query2 = "SELECT id, title, source_url FROM rag_documents WHERE title ILIKE '%28994%' OR source_url ILIKE '%28994%' LIMIT 5";
        const res2 = await client.query(query2);
        console.log("Risultati trovati per 28994 in rag_documents:", res2.rows.length);
        if (res2.rows.length > 0) {
             console.log(res2.rows[0]);
        }
    } catch(e) {
        console.error("Errore rag_documents:", e.message);
    }
    
    await client.end();
}
run();
