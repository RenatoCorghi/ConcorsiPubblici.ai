const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function cleanOrphans() {
    console.log('Cerco documenti orfani (senza chunks)...');
    
    const { data: docs, error: e1 } = await supabase.from('rag_documents').select('id, filename').eq('tipo', 'sentenza_ssuu');
    if (e1) { console.error(e1); return; }
    
    const { data: chunks, error: e2 } = await supabase.from('rag_chunks').select('document_id').eq('tipo', 'sentenza_ssuu');
    if (e2) { console.error(e2); return; }
    
    const chunkDocIds = new Set(chunks.map(c => c.document_id));
    
    const orphanedIds = [];
    for (let doc of docs) {
        if (!chunkDocIds.has(doc.id)) {
            orphanedIds.push(doc.id);
        }
    }
    
    console.log('Trovati ' + orphanedIds.length + ' documenti orfani.');
    
    if (orphanedIds.length > 0) {
        console.log('Eliminazione orfani in corso...');
        // delete in batches of 100
        for (let i = 0; i < orphanedIds.length; i += 100) {
            const batch = orphanedIds.slice(i, i + 100);
            const { error: e3 } = await supabase.from('rag_documents').delete().in('id', batch);
            if (e3) {
                console.error('Errore durante eliminazione:', e3);
            } else {
                console.log('Eliminati ' + batch.length + ' documenti...');
            }
        }
        console.log('Pulizia completata.');
    }
}
cleanOrphans();
