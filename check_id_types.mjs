import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
async function check() {
    const { data: chunks } = await supabase.from('rag_chunks').select('id, document_id').limit(1);
    const { data: docs } = await supabase.from('rag_documents').select('id').limit(1);
    if (chunks && chunks.length > 0) {
        console.log('rag_chunks.id type sample:', chunks[0].id, typeof chunks[0].id);
        console.log('rag_chunks.document_id type sample:', chunks[0].document_id, typeof chunks[0].document_id);
    }
    if (docs && docs.length > 0) {
        console.log('rag_documents.id type sample:', docs[0].id, typeof docs[0].id);
    }
}
check();
