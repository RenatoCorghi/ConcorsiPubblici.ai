/**
 * run_migration.js — Esegue la migrazione SQL per la Hybrid Search su Supabase
 */
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti nel .env');
    process.exit(1);
}

const sqlFile = path.resolve('scripts/migrations/001_hybrid_search.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

// Splittiamo per statement (escludiamo commenti puri e blocchi vuoti)
// Eseguiamo ogni blocco separatamente via REST API
const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

async function execSQL(statement) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql_query: statement })
    });
    
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 300)}`);
    }
    return await res.json();
}

async function main() {
    console.log('\n🗄️  Hybrid Search Migration — Supabase');
    console.log('━'.repeat(50));
    console.log(`📂 SQL: ${sqlFile}`);
    console.log(`🔗 DB:  ${SUPABASE_URL}\n`);

    // Esecuzione in un singolo blocco (i DO $$ e CREATE FUNCTION hanno bisogno dei ;)
    console.log('📝 Invio migrazione completa...');
    try {
        await execSQL(sql);
        console.log('✅ Migrazione completata con successo!');
    } catch (err) {
        console.error('❌ Errore:', err.message);
        console.log('\n💡 Se exec_sql non è disponibile, incolla il contenuto del file SQL');
        console.log(`   direttamente nell'SQL Editor della dashboard Supabase.`);
        console.log(`   File: ${sqlFile}\n`);
    }
}

main().catch(console.error);
