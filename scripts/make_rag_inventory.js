/**
 * MAKE RAG INVENTORY
 * 
 * Esegue un censimento completo ed estremamente preciso di tutto il patrimonio
 * informativo presente nel database RAG su Supabase (rag_documents, rag_chunks)
 * e lo confronta con il patrimonio locale di file VIP.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Caricamento variabili d'ambiente .env
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// Elenco directory VIP locali
const VIP_DIRS = {
    'SS.UU. Cassazione': 'sentenze_ssuu_vip_schede',
    'Sezioni Semplici Cassazione': 'sentenze_sez_semplici_vip',
    'Corte Costituzionale': 'sentenze_corte_cost_vip',
    'Giustizia Amministrativa (CdS/TAR)': 'sentenze_admin_vip',
    'CdS/TAR (Mancanti / Riviste)': 'sentenze_admin_mancanti_vip',
};

function getFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
            results.push(...getFilesRecursive(full));
        } else if (entry.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

async function runInventory() {
    console.log('========================================================');
    console.log('🔍 INVENTARIO COMPLETO DATABASE RAG & FILE VIP');
    console.log('========================================================\n');

    // ────────────────────────────────────────────────────────
    // 1. STATISTICHE GENERALI DB
    // ────────────────────────────────────────────────────────
    const { count: totalDocs, error: errDocs } = await supabase
        .from('rag_documents')
        .select('*', { count: 'exact', head: true });
        
    const { count: totalChunks, error: errChunks } = await supabase
        .from('rag_chunks')
        .select('*', { count: 'exact', head: true });

    if (errDocs || errChunks) {
        console.error('❌ Errore durante il recupero dei dati generali:', errDocs?.message || errChunks?.message);
        return;
    }

    console.log('📊 STATISTICHE GENERALI DATABASE:');
    console.log(`   • Documenti Totali (rag_documents):   ${totalDocs.toLocaleString('it-IT')}`);
    console.log(`   • Chunks Vettorializzati (rag_chunks): ${totalChunks.toLocaleString('it-IT')}`);
    console.log('────────────────────────────────────────────────────────\n');

    // Invece di caricare solo i primi 1000 record (limite PostgREST default),
    // paginiamo in blocchi da 10000 per avere dati precisi su tutti i 51k+ record
    const allDocs = [];
    let offset = 0;
    const limit = 1000;
    process.stdout.write('⏳ Recupero tutti i documenti dal database RAG... ');
    while (true) {
        const { data, error } = await supabase
            .from('rag_documents')
            .select('tipo, materia')
            .range(offset, offset + limit - 1);
            
        if (error) {
            console.error('\n❌ Errore nel caricamento dei dati paginati:', error.message);
            return;
        }
        if (!data || data.length === 0) break;
        allDocs.push(...data);
        offset += data.length;
        process.stdout.write(`${allDocs.length}... `);
        if (data.length < limit) break;
    }
    console.log(' Completato!\n');

    // ────────────────────────────────────────────────────────
    // 2. BREAKDOWN PER TIPO DI DOCUMENTO
    // ────────────────────────────────────────────────────────
    console.log('📄 BREAKDOWN PER TIPO DI DOCUMENTO (DB):');
    
    const tipiCounts = {};
    allDocs.forEach(d => {
        const t = d.tipo || 'Non Specificato';
        tipiCounts[t] = (tipiCounts[t] || 0) + 1;
    });

    // Ordina per conteggio desc
    const sortedTipi = Object.entries(tipiCounts).sort((a, b) => b[1] - a[1]);
    for (const [tipo, count] of sortedTipi) {
        console.log(`   • ${tipo.padEnd(35)}: ${count.toString().padStart(6)} doc`);
    }
    console.log('────────────────────────────────────────────────────────\n');

    // ────────────────────────────────────────────────────────
    // 3. BREAKDOWN PER MATERIA
    // ────────────────────────────────────────────────────────
    console.log('📚 BREAKDOWN PER MATERIA (DB):');
    
    const materiaCounts = {};
    allDocs.forEach(d => {
        const mat = d.materia || 'Non Specificata';
        materiaCounts[mat] = (materiaCounts[mat] || 0) + 1;
    });

    const sortedMaterie = Object.entries(materiaCounts).sort((a, b) => b[1] - a[1]);
    for (const [materia, count] of sortedMaterie) {
        console.log(`   • ${materia.padEnd(35)}: ${count.toString().padStart(6)} doc`);
    }
    console.log('────────────────────────────────────────────────────────\n');

    // ────────────────────────────────────────────────────────
    // 4. MATRICE TIPO / MATERIA
    // ────────────────────────────────────────────────────────
    console.log('🔲 MATRICE INCROCIATA (TIPO x MATERIA - DB):');
    
    const matrix = {};
    allDocs.forEach(d => {
        const t = d.tipo || 'N/A';
        const m = d.materia || 'N/A';
        if (!matrix[t]) matrix[t] = {};
        matrix[t][m] = (matrix[t][m] || 0) + 1;
    });

    for (const [tipo, materie] of Object.entries(matrix)) {
        console.log(`   📍 Tipo: ${tipo}`);
        for (const [materia, count] of Object.entries(materie)) {
            console.log(`      └─ ${materia.padEnd(32)}: ${count.toString().padStart(5)} doc`);
        }
    }
    console.log('────────────────────────────────────────────────────────\n');

    // ────────────────────────────────────────────────────────
    // 5. FILE VIP LOCALI VS DATABASE
    // ────────────────────────────────────────────────────────
    console.log('📁 CONFRONTO ATTUALE: FILE LOCALI VIP VS INGESTIONE RAG:');
    
    for (const [label, dirPath] of Object.entries(VIP_DIRS)) {
        const localFiles = getFilesRecursive(dirPath);
        
        // Filtriamo gli scarti tra i file locali per calcolare le schede valide reali
        const validLocal = localFiles.filter(f => {
            const content = fs.readFileSync(f, 'utf8');
            return !content.includes('[SCARTO_ASSOLUTO]');
        });

        // Query su Supabase per vedere quanti documenti di quel tipo o filename
        // Mappiamo le cartelle al tipo del database
        let filterTipo = '';
        if (label.includes('SS.UU.')) filterTipo = 'sentenza_ssuu_vip';
        if (label.includes('Semplici')) filterTipo = 'sentenza_sez_semplici_vip';
        if (label.includes('Costituzionale')) filterTipo = 'sentenza_cc_vip';
        if (label.includes('Mancanti')) filterTipo = 'sentenza_admin_vip';
        if (label.includes('Amministrativa')) filterTipo = 'sentenza_vip';

        let dbCount = 0;
        if (filterTipo) {
            const { count } = await supabase
                .from('rag_documents')
                .select('*', { count: 'exact', head: true })
                .eq('tipo', filterTipo);
            dbCount = count || 0;
        } else {
            // Cerca per corrispondenza dei filename locali
            let matches = 0;
            const batchSize = 100;
            const filenames = validLocal.slice(0, batchSize).map(f => path.basename(f));
            if (filenames.length > 0) {
                const { count } = await supabase
                    .from('rag_documents')
                    .select('*', { count: 'exact', head: true })
                    .in('filename', filenames);
                matches = count || 0;
            }
            dbCount = `Match campione (${matches}/${Math.min(batchSize, validLocal.length)})`;
        }

        console.log(`   • ${label.padEnd(35)}`);
        console.log(`     └─ Directory locale: ${dirPath}`);
        console.log(`     └─ File .md locali:  ${localFiles.length}`);
        console.log(`     └─ Schede Valide:    ${validLocal.length}`);
        console.log(`     └─ Ingestiti nel DB: ${dbCount}`);
    }
    console.log('========================================================\n');
}

runInventory().catch(e => console.error(e));
