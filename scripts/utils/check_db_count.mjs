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
    const { count, error } = await supabase
        .from('provvedimenti_ga')
        .select('*', { count: 'exact', head: true })
        .eq('sede_slug', 'cds');
    
    console.log('Totale sentenze CdS in DB:', count);
}
check();
