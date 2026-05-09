import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const VIP_TARGETS = [
    'Art. 20 - L. 241/1990',
    'Art. 21-nonies - L. 241/1990',
    'Art. 55-quater - T.U. Pubblico Impiego',
    'Art. 36-bis - T.U. Edilizia',
    'Art. 243-bis - T.U. Enti Locali',
    'Art. 120 - TUB',
    'Art. 33 - Codice Consumo',
    'Art. 73 - T.U. Stupefacenti'
];

async function check() {
    for (const target of VIP_TARGETS) {
        const { data, error } = await supabase
            .from('dottrina_sintetica')
            .select('istituto')
            .eq('istituto', target)
            .single();
            
        if (error || !data) {
            console.log(`❌ MANCANTE: ${target}`);
        } else {
            console.log(`✅ PRESENTE: ${target}`);
        }
    }
}

check();
