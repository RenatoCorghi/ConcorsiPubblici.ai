/**
 * backfill_fts_sql.js
 * Ricalcola TUTTE le fts con tokenizer 'simple' via RPC update_fts_simple
 */
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY);
const BATCH_SIZE = 100;
const CONCURRENCY = 3;

async function main() {
    console.log('\n🔤 Backfill FTS → tokenizer SIMPLE via RPC');
    console.log('━'.repeat(50));
    console.log(`📊 Batch: ${BATCH_SIZE} | Concurrency: ${CONCURRENCY}\n`);

    let processed = 0;
    let errors = 0;
    let lastId = '00000000-0000-0000-0000-000000000000';

    while (true) {
        const { data: rows, error } = await supabase
            .from('rag_chunks')
            .select('id, content, materia, tipo')
            .gt('id', lastId)
            .order('id', { ascending: true })
            .limit(BATCH_SIZE);

        if (error) {
            console.log(`\n⚠️  Errore fetch batch: ${error.message}. Riprovo tra 5s...`);
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        if (!rows || rows.length === 0) break;
        lastId = rows[rows.length - 1].id;

        for (let i = 0; i < rows.length; i += CONCURRENCY) {
            const chunk = rows.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(async row => {
                const ftsText = [row.materia || '', row.tipo || '', row.content || ''].join(' ');
                const { error: rpcErr } = await supabase.rpc('update_fts_simple', {
                    row_id: row.id,
                    fts_text: ftsText
                });
                if (rpcErr) errors++;
            }));
        }

        processed += rows.length;
        process.stdout.write(`\r  ⏳ Processate: ${processed} righe | Err: ${errors}`);

        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n\n✅ Backfill SIMPLE completato! Totale: ${processed} righe`);
    if (errors > 0) console.log(`⚠️  ${errors} errori durante il processo`);
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
