import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(l => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
});

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;

const sql = [
    'CREATE OR REPLACE FUNCTION match_rag_chunks(',
    '  query_embedding vector(768),',
    '  match_threshold float,',
    '  match_count int',
    ')',
    'RETURNS TABLE (',
    '  id uuid,',
    '  document_id uuid,',
    '  content text,',
    '  titolo text,',
    '  materia text,',
    '  tipo text,',
    '  similarity float',
    ')',
    'LANGUAGE plpgsql',
    'SET search_path = public, extensions',
    'AS $$',
    'BEGIN',
    '  RETURN QUERY',
    '  SELECT',
    '    rc.id,',
    '    rc.document_id,',
    '    rc.content,',
    '    rd.titolo,',
    '    rc.materia,',
    '    rc.tipo,',
    '    1 - (rc.embedding <=> query_embedding) AS similarity',
    '  FROM rag_chunks rc',
    '  LEFT JOIN rag_documents rd ON rd.id = rc.document_id',
    '  WHERE 1 - (rc.embedding <=> query_embedding) > match_threshold',
    '  ORDER BY rc.embedding <=> query_embedding',
    '  LIMIT match_count;',
    'END;',
    '$$;'
].join('\n');

// Try exec_sql RPC (may not exist)
let res = await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql_string: sql })
});

if (res.ok) {
    console.log('✅ RPC aggiornata via exec_sql!');
    process.exit(0);
}

console.log('exec_sql non disponibile, provo via Supabase Management API...');

// Try the Supabase Management API (requires a project access token)
// This endpoint is: POST /v1/projects/{ref}/database/query
const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
console.log('Project ref:', projectRef);

// Try using the service key as bearer for the management API
res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
});

console.log('Management API status:', res.status);
const text = await res.text();
console.log('Response:', text.substring(0, 500));

if (!res.ok) {
    console.log('\n⚠️  Accesso programmatico non riuscito.');
    console.log('Per favore esegui questo SQL dalla Dashboard Supabase:');
    console.log(`   ${SUPABASE_URL.replace('.supabase.co', '')}/project/default/sql/new`);
    console.log('\nSQL da incollare:\n');
    console.log(sql);
}
