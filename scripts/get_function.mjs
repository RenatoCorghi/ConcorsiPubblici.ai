import pg from 'pg';
const { Client } = pg;

const client = new Client({
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    port: 5432, database: 'postgres',
    user: 'postgres.wggjfuqsjqwptuprutza',
    password: 'Concorsipoli21!',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 0,
});

await client.connect();

// Get full function source
const res = await client.query(`
    SELECT proname, pronargs, prosrc 
    FROM pg_proc 
    WHERE proname = 'match_documents_hybrid' 
    ORDER BY pronargs
`);

for (const f of res.rows) {
    console.log(`\n═══ OVERLOAD ${f.pronargs} args ═══\n`);
    console.log(f.prosrc);
    console.log('\n' + '─'.repeat(60));
}

await client.end();
