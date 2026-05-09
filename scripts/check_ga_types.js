import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function checkTypes() {
    console.log("🧐 Controllo tipi di dato...");
    // Possiamo usare una query su information_schema se abbiamo i permessi
    const { data, error } = await supabase.rpc('get_table_schema', { t_name: 'provvedimenti_ga' });
    
    if (error) {
        console.log("Impossibile usare helper. Provo query diretta su information_schema...");
        // In Supabase information_schema non è esposto via PostgREST di solito.
        console.log("Non posso verificare i tipi direttamente. Ma l'errore 'pg_catalog.coalesce(text, text) does not exist' suggerisce che uno dei due 'text' sia in realtà un tipo incompatibile (es. citext) o che ci sia un problema di collation.");
    } else {
        console.table(data);
    }
}
checkTypes();
