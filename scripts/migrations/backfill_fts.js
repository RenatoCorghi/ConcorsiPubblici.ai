/**
 * backfill_fts.js
 * ============================================================
 * Popola la colonna `fts` su rag_chunks in batch da 200 righe
 * per evitare il timeout di 60s del piano Supabase Hobby.
 *
 * Esegui DOPO aver creato la colonna fts via SQL Editor.
 * ============================================================
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

async function main() {
    console.log('\n🔤 Backfill colonna fts su rag_chunks');
    console.log('━'.repeat(50));

    // Conta le righe senza fts
    const { count } = await supabase
        .from('rag_chunks')
        .select('id', { count: 'exact', head: true })
        .is('fts', null);

    console.log(`📊 Righe da processare: ${count}\n`);

    if (!count || count === 0) {
        console.log('✅ Tutte le righe hanno già il campo fts popolato!');
        return;
    }

    let processed = 0;
    let batchNum = 0;
    const totalBatches = Math.ceil(count / BATCH_SIZE);

    while (processed < count) {
        batchNum++;
        // Prende un batch di righe senza fts
        const { data: rows, error: fetchErr } = await supabase
            .from('rag_chunks')
            .select('id, content, materia, tipo')
            .is('fts', null)
            .limit(BATCH_SIZE);

        if (fetchErr || !rows || rows.length === 0) {
            console.log('✅ Backfill completato (nessuna riga rimasta).');
            break;
        }

        // Trigger il ricalcolo via una piccola UPDATE:
        // Aggiorniamo ogni riga "toccandola" così il trigger calcola fts.
        // Lo facciamo per ogni riga del batch in parallelo (max 10 concorrenti).
        const CONCURRENCY = 10;
        let done = 0;
        let failed = 0;

        for (let i = 0; i < rows.length; i += CONCURRENCY) {
            const chunk = rows.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(async row => {
                // Aggiorna la riga "toccando" il content per attivare il trigger
                const { error } = await supabase
                    .from('rag_chunks')
                    .update({ content: row.content || '' })
                    .eq('id', row.id);
                if (error) {
                    failed++;
                } else {
                    done++;
                }
            }));
        }

        processed += rows.length;
        const pct = Math.round((processed / count) * 100);
        const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
        process.stdout.write(`\r  [${bar}] ${pct}% | Batch ${batchNum}/${totalBatches} | OK: ${done} | Err: ${failed}`);

        // Pausa breve per non saturare le connessioni
        await new Promise(r => setTimeout(r, 500));
    }

    console.log('\n\n✅ Backfill completato!');
    console.log('💡 Ora puoi eseguire il Blocco 2 (Indici) e Blocco 3 (Trigger + RPC) in Supabase SQL Editor.');
}

main().catch(err => {
    console.error('\n💥 Errore fatale:', err.message);
    process.exit(1);
});
