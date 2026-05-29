/**
 * BACKFILL FTS — Popola la colonna fts su provvedimenti_ga in batch
 * 
 * Evita il timeout del SQL Editor Supabase processando 200 record alla volta.
 * 
 * Uso:
 *   node scripts/backfill-fts-ga.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '..', '.env');
const envFile = readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  BACKFILL FTS su provvedimenti_ga');
    console.log('═══════════════════════════════════════════════════════\n');

    // Conta quanti mancano
    const { count: pending } = await supabase
        .from('provvedimenti_ga')
        .select('*', { count: 'exact', head: true })
        .not('testo_completo', 'is', null)
        .is('fts', null);

    console.log(`📋 Record con testo ma senza FTS: ${pending}\n`);

    if (!pending || pending === 0) {
        console.log('✅ Tutti i record hanno già l\'FTS popolato!');
        return;
    }

    const BATCH = 100;
    let processed = 0;
    const startTime = Date.now();

    while (true) {
        // Fetch batch di ID senza FTS
        const { data, error } = await supabase
            .from('provvedimenti_ga')
            .select('id, testo_completo')
            .not('testo_completo', 'is', null)
            .is('fts', null)
            .limit(BATCH);

        if (error) {
            console.error('❌ Errore fetch:', error.message);
            break;
        }
        if (!data || data.length === 0) break;

        // Aggiorna uno alla volta (il trigger genera automaticamente fts)
        // Ma il trigger scatta su UPDATE OF testo_completo, quindi forziamo un "touch"
        for (const record of data) {
            // Forza il trigger facendo un update "identico" su testo_completo
            const { error: upErr } = await supabase
                .from('provvedimenti_ga')
                .update({ testo_completo: record.testo_completo })
                .eq('id', record.id);

            if (upErr) {
                console.error(`⚠️ Errore update ${record.id}: ${upErr.message}`);
            }
        }

        processed += data.length;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (processed / elapsed * 60).toFixed(0);
        process.stdout.write(`\r  📊 ${processed.toLocaleString('it-IT')}/${pending} FTS popolati | ${rate}/min | ${elapsed}s`);
    }

    console.log(`\n\n✅ Backfill FTS completato! ${processed} record aggiornati.`);

    // Ora crea l'indice GIN (se non esiste)
    console.log('\n⏳ Verifica indice GIN...');
    console.log('💡 Se non esiste ancora, esegui in Supabase SQL Editor:');
    console.log('   CREATE INDEX IF NOT EXISTS idx_provvedimenti_ga_fts ON provvedimenti_ga USING GIN (fts);');
}

main().catch(console.error);
