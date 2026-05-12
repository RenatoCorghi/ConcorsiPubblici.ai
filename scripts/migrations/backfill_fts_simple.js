/**
 * backfill_fts_simple.js
 * Ricalcola TUTTE le fts con tokenizer 'simple' (non solo quelle NULL)
 * Il trigger aggiornato usa 'simple', quindi basta "toccare" ogni riga.
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

const BATCH_SIZE = 200;
const CONCURRENCY = 10;

async function main() {
    console.log('\n🔤 Ricalcolo FTS con tokenizer SIMPLE');
    console.log('━'.repeat(50));

    // Conta il totale
    const { count } = await supabase
        .from('rag_chunks')
        .select('id', { count: 'exact', head: true });

    console.log(`📊 Righe totali: ${count}\n`);

    let processed = 0;
    let batchNum = 0;
    let lastId = '00000000-0000-0000-0000-000000000000';

    while (processed < count) {
        batchNum++;
        // Pagina per id crescente
        const { data: rows, error } = await supabase
            .from('rag_chunks')
            .select('id, content')
            .gt('id', lastId)
            .order('id', { ascending: true })
            .limit(BATCH_SIZE);

        if (error || !rows || rows.length === 0) break;

        lastId = rows[rows.length - 1].id;

        // Tocca ogni riga → trigger ricalcola fts con 'simple'
        let done = 0;
        for (let i = 0; i < rows.length; i += CONCURRENCY) {
            const chunk = rows.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(async row => {
                await supabase.from('rag_chunks')
                    .update({ content: row.content || '' })
                    .eq('id', row.id);
                done++;
            }));
        }

        processed += rows.length;
        const pct = Math.round((processed / count) * 100);
        const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
        process.stdout.write(`\r  [${bar}] ${pct}% | ${processed}/${count}`);

        await new Promise(r => setTimeout(r, 300));
    }

    console.log('\n\n✅ Ricalcolo FTS completato con tokenizer SIMPLE!');
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
