import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envPath = '.env';
const envFile = readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env.SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getSentenzeStats() {
    console.log("=== SENTENZE STATS ===");

    // Total sentenze (tipo_provvedimento IN SENTENZA, SENTENZA BREVE)
    const { count: totalSentenze, error: err1 } = await supabase
        .from('provvedimenti_ga')
        .select('*', { count: 'exact', head: true })
        .in('tipo_provvedimento', ['SENTENZA', 'SENTENZA BREVE']);

    // Populated sentenze (downloaded)
    const { count: populatedSentenze, error: err2 } = await supabase
        .from('provvedimenti_ga')
        .select('*', { count: 'exact', head: true })
        .in('tipo_provvedimento', ['SENTENZA', 'SENTENZA BREVE'])
        .not('testo_completo', 'is', null);

    // Remaining sentenze (to download)
    const { count: remainingSentenze, error: err3 } = await supabase
        .from('provvedimenti_ga')
        .select('*', { count: 'exact', head: true })
        .in('tipo_provvedimento', ['SENTENZA', 'SENTENZA BREVE'])
        .is('testo_completo', null);

    console.log("Total sentenze in DB:", totalSentenze, err1);
    console.log("Downloaded sentenze:", populatedSentenze, err2);
    console.log("Remaining sentenze to download:", remainingSentenze, err3);
}

getSentenzeStats().catch(console.error);
