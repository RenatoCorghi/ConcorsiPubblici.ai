import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function run() {
    const { data, error } = await supabase
        .from('provvedimenti_ga')
        .select('testo_completo, oggetto_ricorso')
        .not('testo_completo', 'is', null)
        .limit(1);
    
    if (data && data[0]) {
        fs.writeFileSync('sample_admin_text.txt', data[0].testo_completo);
        fs.writeFileSync('sample_admin_meta.json', JSON.stringify(data[0]));
        console.log("Sentenza trovata e salvata!");
    } else {
        console.log("Nessuna sentenza trovata.");
    }
}
run();
