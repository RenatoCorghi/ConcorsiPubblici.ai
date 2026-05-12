import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carica variabili d'ambiente da .env
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            process.env[key] = value;
        }
    });
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
    const years = [2021, 2022, 2023, 2024, 2025, 2026];
    console.log('--- STATS TAR LAZIO ---');
    for (const year of years) {
        const { count, error } = await supabase
            .from('provvedimenti_ga')
            .select('*', { count: 'exact', head: true })
            .eq('sede_slug', 'tar-lazio-roma')
            .eq('anno_pubblicazione', year);
        
        const { count: withText } = await supabase
            .from('provvedimenti_ga')
            .select('*', { count: 'exact', head: true })
            .eq('sede_slug', 'tar-lazio-roma')
            .eq('anno_pubblicazione', year)
            .not('testo_completo', 'is', null);

        console.log(`${year}: ${count} record (${withText} con testo)`);
    }
}

check();
