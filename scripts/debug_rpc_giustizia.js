import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function debug() {
    console.log("🔍 Investigazione RPC search_provvedimenti...");

    const { data, error } = await supabase.rpc('get_function_definition', { fn_name: 'search_provvedimenti' });
    
    if (error) {
        // Se non abbiamo la RPC di aiuto, proviamo con una query diretta (se i permessi lo permettono)
        const { data: rawData, error: rawError } = await supabase
            .from('pg_proc')
            .select('prosrc')
            .ilike('proname', 'search_provvedimenti')
            .single();
            
        if (rawError) {
            console.error("Impossibile recuperare la definizione:", rawError.message);
            return;
        }
        console.log("Definizione trovata:\n", rawData.prosrc);
    } else {
        console.log("Definizione trovata via helper:\n", data);
    }
}

debug();
