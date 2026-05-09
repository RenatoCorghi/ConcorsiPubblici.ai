import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function insert() {
    const missing = [
        { istituto: 'Art. 20 - L. 241/1990', materia: 'Diritto Amministrativo', contenuto_markdown: 'Testo dell\'articolo 20 della legge 241/1990 sul Silenzio Assenso.' },
        { istituto: 'Art. 21-nonies - L. 241/1990', materia: 'Diritto Amministrativo', contenuto_markdown: 'Testo dell\'articolo 21-nonies della legge 241/1990 sull\'Annullamento d\'ufficio.' }
    ];

    const { data, error } = await supabase
        .from('dottrina_sintetica')
        .insert(missing);

    if (error) {
        console.error("❌ Errore inserimento:", error);
    } else {
        console.log("✅ Inseriti segnaposto per gli articoli VIP mancanti!");
    }
}

insert();
