const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function check() {
    const { data, error } = await supabase.from('rag_documents').select('id, materia').eq('tipo', 'sentenza_ssuu');
    if (error) { console.error(error); return; }
    let civ = 0;
    let pen = 0;
    let gen = 0;
    for (let d of data) {
        if (d.materia === 'civile' || d.materia === 'Civile') civ++;
        else if (d.materia === 'penale' || d.materia === 'Penale') pen++;
        else gen++;
    }
    console.log('Totale DB: ' + data.length);
    console.log('Civile: ' + civ);
    console.log('Penale: ' + pen);
    console.log('Generale: ' + gen);
}
check();
