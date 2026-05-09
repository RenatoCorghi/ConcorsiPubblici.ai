const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function check() {
    const { data: docs, error: e1 } = await supabase.from('rag_documents').select('id, titolo, filename').eq('tipo', 'sentenza_ssuu');
    if (e1) { console.error(e1); return; }
    
    const { data: chunks, error: e2 } = await supabase.from('rag_chunks').select('document_id').eq('tipo', 'sentenza_ssuu');
    if (e2) { console.error(e2); return; }
    
    const chunkDocIds = new Set(chunks.map(c => c.document_id));
    
    let missing = 0;
    for (let doc of docs) {
        if (!chunkDocIds.has(doc.id)) {
            missing++;
        }
    }
    console.log('Documenti totali: ' + docs.length);
    console.log('Documenti senza chunks: ' + missing);
}
check();
