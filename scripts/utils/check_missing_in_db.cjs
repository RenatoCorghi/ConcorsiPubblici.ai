const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function check() {
    const { data, error } = await supabase.from('rag_documents').select('filename').eq('tipo', 'sentenza_ssuu');
    if (error) { console.error(error); return; }
    
    const dbFilenames = new Set(data.map(d => d.filename));
    
    const checkDir = (dir) => {
        if (!fs.existsSync(dir)) return 0;
        let missing = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                missing += checkDir(path.join(dir, entry.name));
            } else if (entry.name.endsWith('S.txt')) {
                const mdName = entry.name.replace('.txt', '.md');
                if (!dbFilenames.has(mdName)) {
                    missing++;
                }
            }
        }
        return missing;
    };

    const c1 = checkDir('./scraper_cassazione/sentenze_ssuu_civile_clean');
    const c2 = checkDir('./scraper_cassazione/sentenze_ssuu_penale_clean');
    
    console.log('Mancanti in DB da civile: ' + c1);
    console.log('Mancanti in DB da penale: ' + c2);
}
check();
