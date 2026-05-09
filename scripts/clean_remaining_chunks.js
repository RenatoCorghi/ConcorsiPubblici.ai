import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const DRY_RUN = !process.argv.includes('--apply');

async function cleanChunks() {
    console.log(`🧹 PULIZIA CHUNK RESIDUI — ${DRY_RUN ? '🧪 DRY RUN' : '⚡ APPLICAZIONE REALE'}\n`);

    // Trova TUTTI i chunk sentenza_admin che iniziano ancora con "Documento:"
    let allChunks = [];
    let offset = 0;
    const PAGE = 1000;

    while (true) {
        const { data: batch } = await supabase
            .from('rag_chunks')
            .select('id, content, chunk_index')
            .eq('tipo', 'sentenza_admin')
            .range(offset, offset + PAGE - 1);

        if (!batch || batch.length === 0) break;
        
        // Filtra solo quelli con il vecchio formato "Documento: xxx"
        const dirty = batch.filter(c => /^Documento:\s*\S+\s+\d{4}\s+\d+/m.test(c.content));
        allChunks.push(...dirty);
        
        offset += PAGE;
        if (batch.length < PAGE) break;
    }

    console.log(`Chunk con "Documento: xxx" ancora presenti: ${allChunks.length}\n`);

    let cleaned = 0, errors = 0;

    for (const chunk of allChunks) {
        // Rimuovi la riga "Documento: cds 2025 202509430"
        // Rimuovi anche qualsiasi codice interno a 9+ cifre
        const newContent = chunk.content
            .replace(/^Documento:\s*\S+\s+\d{4}\s+\d+\s*\n?/m, '')
            .replace(/\b(?:cds|tar[\w-]*)\s+\d{4}\s+\d{8,}\b/gi, '[riferimento registro GA]')
            .replace(/\b20\d{7,}\b/g, '[cod. registro]')
            .trim();

        if (DRY_RUN) {
            if (cleaned < 3) {
                console.log(`─── PREVIEW chunk_index=${chunk.chunk_index} ───`);
                console.log(`PRIMA: ${chunk.content.substring(0, 120)}...`);
                console.log(`DOPO:  ${newContent.substring(0, 120)}...`);
                console.log('');
            }
        } else {
            const { error } = await supabase
                .from('rag_chunks')
                .update({ content: newContent })
                .eq('id', chunk.id);

            if (error) {
                errors++;
                if (errors <= 3) console.error(`  ❌ Errore: ${error.message}`);
            }

            if (cleaned % 100 === 0) process.stdout.write(`\r  Puliti: ${cleaned}...`);
        }

        cleaned++;
    }

    console.log(`\n${"═".repeat(50)}`);
    console.log(`📊 RIEPILOGO:`);
    console.log(`   ✅ Puliti: ${cleaned}`);
    console.log(`   ❌ Errori: ${errors}`);
    if (DRY_RUN) {
        console.log(`\n🧪 DRY RUN. Per applicare: node scripts/clean_remaining_chunks.js --apply`);
    }
}

cleanChunks().catch(e => console.error("Fatal:", e));
