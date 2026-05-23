/**
 * ============================================================
 * HARD DELETE — Riviste sotto copyright
 * ============================================================
 * 
 * Cancella DEFINITIVAMENTE da Supabase:
 *   - rag_chunks (prima, per via del FK)
 *   - rag_documents
 * 
 * Target:
 *   1. Giurisprudenza Italiana (rivista_vip, editore NULL, titolo giurit_)
 *   2. Giurisprudenza Italiana (massimario_teoria, titolo giurit_)
 *   3. Federalismi.it (rivista_vip, editore Federalismi.it)
 *   4. Rivista Corte dei Conti (editore esplicito)
 *   5. Corte dei Conti (editore NULL, titolo corteconti)
 * 
 * USO:
 *   node scripts/hard_delete_riviste_copyright.js          → DRY RUN
 *   node scripts/hard_delete_riviste_copyright.js --execute → CANCELLAZIONE REALE
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const EXECUTE = process.argv.includes('--execute');

// ══════════════════════════════════════════
// TARGETS
// ══════════════════════════════════════════
const TARGETS = [
    {
        label: 'Giurisprudenza Italiana (rivista_vip)',
        query: () => fetchDocs({ tipo: 'rivista_vip', editoreNull: true, titleLike: '%giurit_%' })
    },
    {
        label: 'Giurisprudenza Italiana (massimario_teoria)',
        query: () => fetchDocs({ tipo: 'massimario_teoria', titleLike: '%giurit_%' })
    },
    {
        label: 'Federalismi.it (rivista_vip)',
        query: () => fetchDocs({ tipo: 'rivista_vip', editore: 'Federalismi.it' })
    },
    {
        label: 'Rivista Corte dei Conti (editore esplicito)',
        query: () => fetchDocs({ editore: 'Rivista Corte dei Conti' })
    },
    {
        label: 'Corte dei Conti (editore NULL, titolo corteconti)',
        query: () => fetchDocs({ editoreNull: true, titleLike: '%corteconti%' })
    }
];

// ══════════════════════════════════════════
// FETCH PAGINATO
// ══════════════════════════════════════════
async function fetchDocs({ tipo, editore, editoreNull, titleLike }) {
    const docs = [];
    let offset = 0;
    while (true) {
        let q = supabase.from('rag_documents').select('id, titolo, tipo').range(offset, offset + 999);
        if (tipo) q = q.eq('tipo', tipo);
        if (editore) q = q.eq('editore', editore);
        if (editoreNull) q = q.is('editore', null);
        if (titleLike) q = q.ilike('titolo', titleLike);
        
        const { data, error } = await q;
        if (error) { console.error(`  ❌ Query error:`, error.message); break; }
        if (!data || data.length === 0) break;
        docs.push(...data);
        offset += 1000;
        if (data.length < 1000) break;
    }
    return docs;
}

// ══════════════════════════════════════════
// DELETE BATCH
// ══════════════════════════════════════════
async function deleteChunksByDocIds(docIds) {
    let deleted = 0;
    const BATCH = 100; // Batch più piccoli per DELETE
    for (let i = 0; i < docIds.length; i += BATCH) {
        const batch = docIds.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('rag_chunks')
            .delete()
            .in('document_id', batch)
            .select('id');
        
        if (error) {
            console.error(`    ❌ Errore delete chunk (batch ${Math.floor(i/BATCH)+1}):`, error.message);
            continue;
        }
        deleted += data ? data.length : 0;
    }
    return deleted;
}

async function deleteDocsByIds(docIds) {
    let deleted = 0;
    const BATCH = 100;
    for (let i = 0; i < docIds.length; i += BATCH) {
        const batch = docIds.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('rag_documents')
            .delete()
            .in('id', batch)
            .select('id');
        
        if (error) {
            console.error(`    ❌ Errore delete doc (batch ${Math.floor(i/BATCH)+1}):`, error.message);
            continue;
        }
        deleted += data ? data.length : 0;
    }
    return deleted;
}

// ══════════════════════════════════════════
// CONTA CHUNK
// ══════════════════════════════════════════
async function countChunks(docIds) {
    let total = 0;
    const BATCH = 200;
    for (let i = 0; i < docIds.length; i += BATCH) {
        const batch = docIds.slice(i, i + BATCH);
        const { count } = await supabase
            .from('rag_chunks')
            .select('id', { count: 'exact', head: true })
            .in('document_id', batch);
        total += count || 0;
    }
    return total;
}

// ══════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════
async function main() {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  🗑️  HARD DELETE — RIVISTE SOTTO COPYRIGHT');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`  Modalità: ${EXECUTE ? '🔴🔴🔴 CANCELLAZIONE DEFINITIVA 🔴🔴🔴' : '🟢 DRY RUN (solo conteggio)'}`);
    console.log('══════════════════════════════════════════════════════════════\n');

    let grandDocs = 0;
    let grandChunks = 0;

    for (const target of TARGETS) {
        console.log(`\n📚 ${target.label}`);
        console.log('─'.repeat(60));

        const docs = await target.query();
        console.log(`  📄 Documenti: ${docs.length}`);

        if (docs.length === 0) continue;

        docs.slice(0, 2).forEach(d => console.log(`     → ${d.titolo}`));
        if (docs.length > 2) console.log(`     ... e altri ${docs.length - 2}`);

        const docIds = docs.map(d => d.id);
        const chunkCount = await countChunks(docIds);
        console.log(`  🔢 Chunk associati: ${chunkCount}`);

        if (EXECUTE) {
            // 1) Prima i chunk (FK)
            console.log(`  ⏳ Eliminazione chunk...`);
            const deletedChunks = await deleteChunksByDocIds(docIds);
            console.log(`  ✅ Chunk eliminati: ${deletedChunks}`);

            // 2) Poi i documenti
            console.log(`  ⏳ Eliminazione documenti...`);
            const deletedDocs = await deleteDocsByIds(docIds);
            console.log(`  ✅ Documenti eliminati: ${deletedDocs}`);

            grandDocs += deletedDocs;
            grandChunks += deletedChunks;
        } else {
            console.log(`  🟡 DRY RUN: verrebbero eliminati ${chunkCount} chunk + ${docs.length} documenti`);
            grandDocs += docs.length;
            grandChunks += chunkCount;
        }
    }

    console.log('\n\n══════════════════════════════════════════════════════════════');
    console.log('  📊 RIEPILOGO FINALE');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`  Documenti: ${grandDocs}`);
    console.log(`  Chunk:     ${grandChunks}`);

    if (EXECUTE) {
        console.log('\n  ✅ CANCELLAZIONE COMPLETATA. Dati rimossi definitivamente da Supabase.');
        console.log('  ℹ️  Le schede .md restano sul PC locale.\n');
    } else {
        console.log('\n  ⚡ Per eseguire la cancellazione definitiva:');
        console.log('     node scripts/hard_delete_riviste_copyright.js --execute\n');
    }
}

main().catch(err => {
    console.error('❌ Errore fatale:', err);
    process.exit(1);
});
