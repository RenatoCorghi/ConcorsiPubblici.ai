import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function check() {
    console.log('====================================================');
    console.log('📊 STATISTICHE DATABASE RAG (TIER 1 vs TIER 2)');
    console.log('====================================================\n');

    // 1. Chunks Totali e per Tier
    const { count: totalChunks } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true });
    const { count: tier1Chunks } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true }).eq('tier', 1);
    const { count: tier2Chunks } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true }).eq('tier', 2);

    console.log(`🔹 CHUNKS IN RAG_CHUNKS:`);
    console.log(`   • Chunks Totali: ${totalChunks || 0}`);
    console.log(`   • Tier 1 (VIP / Gold): ${tier1Chunks || 0} (${((tier1Chunks/totalChunks)*100).toFixed(1)}%)`);
    console.log(`   • Tier 2 (Silver / Raw): ${tier2Chunks || 0} (${((tier2Chunks/totalChunks)*100).toFixed(1)}%)\n`);

    // 2. Documenti Totali e per Tipo
    const { count: totalDocs } = await supabase.from('rag_documents').select('*', { count: 'exact', head: true });
    console.log(`🔹 DOCUMENTI IN RAG_DOCUMENTS:`);
    console.log(`   • Documenti Totali: ${totalDocs || 0}`);

    const tipi = [
        { tipo: 'sentenza_ssuu', desc: 'Sentenze SS.UU. (VIP)' },
        { tipo: 'rivista_vip', desc: 'Articoli Riviste (VIP)' },
        { tipo: 'sentenza_admin', desc: 'Sentenze Giustizia Amm. (VIP)' },
        { tipo: 'corte_conti_vip', desc: 'Corte dei Conti (VIP)' },
        { tipo: 'corte_cost_vip', desc: 'Corte Costituzionale (VIP)' },
        { tipo: 'federalismi_vip', desc: 'Federalismi.it (VIP)' },
        { tipo: 'massime_vip', desc: 'Massimario (VIP)' },
        { tipo: 'tributario_vip', desc: 'Diritto Tributario (VIP)' },
        { tipo: 'sentenza_sez_semplici', desc: 'Cassazione Sez. Semplici (Tier 2)' }
    ];

    for (const t of tipi) {
        const { count } = await supabase.from('rag_documents').select('*', { count: 'exact', head: true }).eq('tipo', t.tipo);
        if (count > 0) {
            console.log(`   • ${t.desc} (${t.tipo}): ${count}`);
        }
    }
    console.log();

    // 3. Distribuzione Anno per Tier 2
    console.log(`🔹 DISTRIBUZIONE ANNO PER TIER 2 (CHUNKS):`);
    const anni = [2021, 2022, 2023, 2024, 2025, 2026];
    for (const anno of anni) {
        const { count } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true }).eq('tier', 2).eq('anno', anno);
        console.log(`   • Anno ${anno}: ${count || 0} chunks`);
    }
    console.log();

    // 4. Distribuzione Materie per Tier 2
    console.log(`🔹 MATERIE NEI DOCUMENTI DI TIER 2 (Cassazione Semplice):`);
    const materie = ['Diritto Penale', 'Diritto Civile'];
    for (const materia of materie) {
        const { count: docsCount } = await supabase.from('rag_documents').select('*', { count: 'exact', head: true }).eq('tipo', 'sentenza_sez_semplici').eq('materia', materia);
        console.log(`   • Materia '${materia}': ${docsCount || 0} documenti`);
    }
    
    // Controlliamo anche i chunks per materia
    console.log(`🔹 CHUNKS TIER 2 PER MATERIA:`);
    for (const materia of materie) {
        const { count: chunksCount } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true }).eq('tier', 2).eq('materia', materia);
        console.log(`   • Materia '${materia}': ${chunksCount || 0} chunks`);
    }
    console.log('====================================================');
}

check();
