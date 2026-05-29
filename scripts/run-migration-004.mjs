/**
 * Esecutore migrazione SQL via Supabase RPC
 * 
 * Esegue la migrazione 004_screening_fts.sql passo per passo
 * usando le API Supabase (non serve psql).
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

async function runSQL(label, sql) {
    console.log(`\n⏳ ${label}...`);
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
        // Se exec_sql non esiste, proviamo direttamente con la REST API
        console.log(`   ⚠️ RPC non disponibile: ${error.message}`);
        console.log(`   💡 Esegui manualmente in Supabase SQL Editor:`);
        console.log(`   ${sql.substring(0, 200)}...`);
        return false;
    }
    console.log(`   ✅ OK`);
    return true;
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  MIGRAZIONE 004: Screening + FTS');
    console.log('═══════════════════════════════════════════════════════');

    // Tentiamo prima di verificare se le colonne esistono già
    console.log('\n🔍 Verifico stato attuale delle colonne...');
    
    // Test: prova a leggere importance_score
    const { data: testData, error: testErr } = await supabase
        .from('provvedimenti_ga')
        .select('id, importance_score, importance_tier')
        .limit(1);

    if (testErr && testErr.message.includes('importance_score')) {
        console.log('   ❌ Colonne importance_score/importance_tier NON esistono.');
        console.log('   📋 Devi eseguire questa SQL in Supabase SQL Editor:');
        console.log();
        const sqlContent = readFileSync(path.join(__dirname, 'migrations', '004_screening_fts.sql'), 'utf8');
        console.log(sqlContent);
    } else if (testErr) {
        console.log(`   ❌ Errore generico: ${testErr.message}`);
    } else {
        console.log('   ✅ Colonne importance_score/importance_tier già esistenti!');
        
        // Verifica FTS
        const { data: ftsTest, error: ftsErr } = await supabase
            .from('provvedimenti_ga')
            .select('id, fts')
            .limit(1);
            
        if (ftsErr && ftsErr.message.includes('fts')) {
            console.log('   ❌ Colonna FTS NON esiste ancora.');
            console.log('   📋 Esegui la parte FTS della migrazione in Supabase SQL Editor.');
        } else {
            console.log('   ✅ Colonna FTS già esistente!');
        }
        
        // Conta quante hanno già il score
        const { count: scored } = await supabase
            .from('provvedimenti_ga')
            .select('*', { count: 'exact', head: true })
            .not('importance_score', 'is', null);
        
        const { count: total } = await supabase
            .from('provvedimenti_ga')
            .select('*', { count: 'exact', head: true })
            .in('tipo_provvedimento', ['SENTENZA', 'SENTENZA BREVE'])
            .not('testo_completo', 'is', null);
        
        console.log(`\n📊 Stato scoring: ${scored || 0} scorate su ${total} con testo (${total ? ((scored / total * 100) || 0).toFixed(1) : 0}%)`);
    }
}

main().catch(console.error);
