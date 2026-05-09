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
    console.log('--- STATISTICHE RAG SU SUPABASE ---');
    
    const tipi = ['sentenza_ssuu', 'rivista_vip', 'sentenza_admin'];
    for (const tipo of tipi) {
        const { count } = await supabase.from('rag_documents').select('*', { count: 'exact', head: true }).eq('tipo', tipo);
        console.log('Tipo: ' + tipo + ' | Documenti: ' + (count || 0));
    }

    const { count: totalChunks } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true });
    console.log('\n- TOTALE CHUNKS VETTORIALIZZATI: ' + totalChunks);
}
check();
