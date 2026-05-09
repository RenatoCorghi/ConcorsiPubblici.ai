import { createClient } from '@supabase/supabase-js';

// Leggi configurazione. Metti qui la tua chiave segreta o usa .env
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wggjfuqsjqwptuprutza.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_KEY || 'sb_publishable_9RLOMhYtEvC0ehjgupQqkQ_GbVdzJf6';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkDb() {
    console.log('🔍 Controllo record in Supabase (provvedimenti_ga)...\n');

    const { data: stats, error } = await supabase.rpc('get_provvedimenti_stats');
    
    if (error) {
        // Se l'RPC fallisce (magari non l'hai creata), faccio un conteggio aggregato in js
        console.log('⚠️ RPC get_provvedimenti_stats non trovata o errore:', error.message);
        console.log('Faccio un fetch dei metadati...');
        
        let conteggiAnno = {};
        let conteggiTipo = {};
        let totale = 0;
        
        // Count semplice degli anni (limitato, ma per dare idea)
        const anni = [2026, 2025, 2024, 2023, 2022, 2021];
        
        for (const anno of anni) {
            const { count } = await supabase
                .from('provvedimenti_ga')
                .select('*', { count: 'exact', head: true })
                .eq('anno_pubblicazione', anno);
            
            if (count > 0) {
                conteggiAnno[anno] = count;
                totale += count;
            }
        }
        
        console.log(`\n📊 TOTALE PROVVEDIMENTI: ${totale.toLocaleString('it-IT')}`);
        console.log('\n📅 Distribuzione per ANNO:');
        for (const [anno, c] of Object.entries(conteggiAnno)) {
            console.log(`   ${anno}: ${c.toLocaleString('it-IT')}`);
        }
        
        return;
    }

    let totale = 0;
    let byAnno = {};
    let byMacroTipo = {};

    for (const row of stats || []) {
        totale += parseInt(row.conteggio);
        byAnno[row.anno] = (byAnno[row.anno] || 0) + parseInt(row.conteggio);
        
        // Estrai la prima parola (es: ORDINANZA CAUTELARE -> ORDINANZA)
        const macro = row.tipo.split(' ')[0];
        byMacroTipo[macro] = (byMacroTipo[macro] || 0) + parseInt(row.conteggio);
    }

    console.log(`📊 TOTALE PROVVEDIMENTI: ${totale.toLocaleString('it-IT')}`);
    
    console.log('\n📅 Distribuzione per ANNO:');
    for (const [anno, count] of Object.entries(byAnno).sort((a,b) => b[0] - a[0])) {
        console.log(`   ${anno}: ${count.toLocaleString('it-IT')}`);
    }

    console.log('\n📄 Distribuzione per MACRO TIPO:');
    for (const [tipo, count] of Object.entries(byMacroTipo).sort((a,b) => b[1] - a[1])) {
        console.log(`   ${tipo}: ${count.toLocaleString('it-IT')}`);
    }
    
    console.log('\n✅ Script completato.');
    console.log('💡 Per scaricare anni mancanti, esegui: node scripts/scraper-openga.js --anno=2024 --import-supabase');
}

checkDb();
