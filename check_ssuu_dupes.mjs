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
    const { data, count } = await supabase.from('rag_documents')
        .select('filename, count()')
        .eq('tipo', 'sentenza_ssuu');
    
    // Per capire meglio, contiamo i duplicati
    const { data: allDocs } = await supabase.from('rag_documents').select('filename').eq('tipo', 'sentenza_ssuu');
    const counts = {};
    allDocs.forEach(d => {
        counts[d.filename] = (counts[d.filename] || 0) + 1;
    });
    
    const duplicates = Object.keys(counts).filter(f => counts[f] > 1);
    console.log('Documenti totali SSUU:', allDocs.length);
    console.log('File unici SSUU:', Object.keys(counts).length);
    console.log('File duplicati:', duplicates.length);
    if (duplicates.length > 0) {
        console.log('Esempio duplicato:', duplicates[0], 'Count:', counts[duplicates[0]]);
    }
}
check();
