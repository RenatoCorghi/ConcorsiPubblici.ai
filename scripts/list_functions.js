import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function list() {
    console.log("📜 Elenco Funzioni RPC...");
    // Usiamo una query sulla vista delle funzioni di Supabase se disponibile
    const { data, error } = await supabase
        .from('pg_proc')
        .select('proname')
        .limit(10);
        
    if (error) {
        console.log("Impossibile leggere pg_proc. Provo a chiamare search_provvedimenti con parametri vuoti per forzare un errore di firma.");
        const { error: err2 } = await supabase.rpc('search_provvedimenti', {});
        console.log("Errore firma:", err2.message);
    } else {
        console.log("Funzioni:", data);
    }
}
list();
