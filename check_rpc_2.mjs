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
    const { data, error } = await supabase.rpc('match_documents', {
        query_embedding: new Array(768).fill(0),
        match_threshold: 0.1,
        match_count: 1
    });
    if (error) {
        console.log('Error or match_documents missing:', error.message);
    } else {
        console.log('match_documents RPC exists!');
    }
}
check();
