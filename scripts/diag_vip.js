import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Caricamento .env
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const INPUT_DIR = path.resolve('./sentenze_ssuu_vip_clean');
const OUTPUT_DIR = path.resolve('./sentenze_ssuu_vip_schede');

async function diagnostic() {
    const existingFilenames = new Set();
    let offset = 0;
    const limit = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('rag_documents')
            .select('filename')
            .eq('tipo', 'sentenza_ssuu')
            .range(offset, offset + limit - 1);
        if (error) break;
        if (!data || data.length === 0) break;
        data.forEach(d => existingFilenames.add(d.filename));
        offset += limit;
        if (data.length < limit) break;
    }

    console.log(`DB Count: ${existingFilenames.size}`);

    let totalS = 0;
    let skippedDB = 0;
    let skippedLocal = 0;
    let toProcess = 0;

    const scan = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.name.endsWith('S.md')) {
                totalS++;
                const relPath = path.relative(INPUT_DIR, fullPath);
                const outputFilePath = path.join(OUTPUT_DIR, relPath);

                let isSkipped = false;
                if (fs.existsSync(outputFilePath)) {
                    skippedLocal++;
                    isSkipped = true;
                }
                if (existingFilenames.has(entry.name)) {
                    skippedDB++;
                    isSkipped = true;
                }
                
                if (!isSkipped) {
                    toProcess++;
                }
            }
        }
    };

    scan(INPUT_DIR);

    console.log(`Total S.md found: ${totalS}`);
    console.log(`Skipped (Local): ${skippedLocal}`);
    console.log(`Skipped (DB): ${skippedDB}`);
    console.log(`Missing (To Process): ${toProcess}`);
}

diagnostic();
