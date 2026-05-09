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
    const { data, error } = await supabase.from('rag_documents').select('*').limit(1);
    if (error) {
        console.log('Error:', error);
    } else if (data && data.length > 0) {
        console.log('Columns rag_documents:', Object.keys(data[0]));
    } else {
        console.log('rag_documents is empty.');
    }
}
check();
