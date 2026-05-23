/**
 * ============================================================
 * DE-VETTORIALIZZAZIONE RIVISTE PER COPYRIGHT
 * ============================================================
 * 
 * Rimuove gli embedding (senza cancellare i dati) dai chunk
 * relativi a:
 *   1. Giurisprudenza Italiana (giurit_*) — rivista_vip + massimario_teoria
 *   2. Federalismi.it — rivista_vip
 * 
 * I documenti e i chunk restano nel DB ma non saranno più
 * recuperabili via ricerca vettoriale.
 * 
 * USO:
 *   node scripts/devectorize_riviste_copyright.js          → DRY RUN (solo audit)
 *   node scripts/devectorize_riviste_copyright.js --execute → Esegue
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── ENV ──
const envFile = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Chiavi Supabase mancanti nel .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const EXECUTE = process.argv.includes('--execute');

// ══════════════════════════════════════════
// TARGET DEFINITIONS
// ══════════════════════════════════════════
// Ogni target definisce come trovare i documenti da de-vettorializzare
const TARGETS = [
    {
        label: 'Giurisprudenza Italiana (rivista_vip, editore NULL, titolo giurit_)',
        fonte: 'Giurisprudenza Italiana',
        query: async () => {
            const docs = [];
            let offset = 0;
            while (true) {
                const { data } = await supabase
                    .from('rag_documents')
                    .select('id, titolo, filename, anno')
                    .eq('tipo', 'rivista_vip')
                    .is('editore', null)
                    .ilike('titolo', '%giurit_%')
                    .range(offset, offset + 999);
                if (!data || data.length === 0) break;
                docs.push(...data);
                offset += 1000;
                if (data.length < 1000) break;
            }
            return docs;
        }
    },
    {
        label: 'Giurisprudenza Italiana (massimario_teoria, titolo giurit_)',
        fonte: 'Giurisprudenza Italiana',
        query: async () => {
            const docs = [];
            let offset = 0;
            while (true) {
                const { data } = await supabase
                    .from('rag_documents')
                    .select('id, titolo, filename, anno')
                    .eq('tipo', 'massimario_teoria')
                    .ilike('titolo', '%giurit_%')
                    .range(offset, offset + 999);
                if (!data || data.length === 0) break;
                docs.push(...data);
                offset += 1000;
                if (data.length < 1000) break;
            }
            return docs;
        }
    },
    {
        label: 'Federalismi.it (rivista_vip, editore Federalismi.it)',
        fonte: 'Federalismi.it',
        query: async () => {
            const docs = [];
            let offset = 0;
            while (true) {
                const { data } = await supabase
                    .from('rag_documents')
                    .select('id, titolo, filename, anno')
                    .eq('tipo', 'rivista_vip')
                    .eq('editore', 'Federalismi.it')
                    .range(offset, offset + 999);
                if (!data || data.length === 0) break;
                docs.push(...data);
                offset += 1000;
                if (data.length < 1000) break;
            }
            return docs;
        }
    }
];

// ══════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════

async function countActiveChunks(documentIds) {
    if (documentIds.length === 0) return 0;
    let total = 0;
    const BATCH = 200;
    for (let i = 0; i < documentIds.length; i += BATCH) {
        const batch = documentIds.slice(i, i + BATCH);
        const { count, error } = await supabase
            .from('rag_chunks')
            .select('id', { count: 'exact', head: true })
            .in('document_id', batch)
            .not('embedding', 'is', null);
        if (error) { console.error(`  ❌ Errore conteggio:`, error.message); continue; }
        total += count || 0;
    }
    return total;
}

async function countTotalChunks(documentIds) {
    if (documentIds.length === 0) return 0;
    let total = 0;
    const BATCH = 200;
    for (let i = 0; i < documentIds.length; i += BATCH) {
        const batch = documentIds.slice(i, i + BATCH);
        const { count, error } = await supabase
            .from('rag_chunks')
            .select('id', { count: 'exact', head: true })
            .in('document_id', batch);
        if (error) { console.error(`  ❌ Errore conteggio:`, error.message); continue; }
        total += count || 0;
    }
    return total;
}

async function nullifyEmbeddings(documentIds) {
    if (documentIds.length === 0) return { updated: 0, errors: 0 };
    let updated = 0;
    let errors = 0;
    const BATCH = 200;

    for (let i = 0; i < documentIds.length; i += BATCH) {
        const batch = documentIds.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('rag_chunks')
            .update({ embedding: null })
            .in('document_id', batch)
            .not('embedding', 'is', null)
            .select('id');

        if (error) {
            console.error(`  ❌ Errore nullify (batch ${Math.floor(i/BATCH)+1}):`, error.message);
            errors++;
            continue;
        }
        updated += data ? data.length : 0;
    }
    return { updated, errors };
}

async function markDocumentsSuspended(documentIds) {
    if (documentIds.length === 0) return;
    const BATCH = 200;
    for (let i = 0; i < documentIds.length; i += BATCH) {
        const batch = documentIds.slice(i, i + BATCH);
        const { error } = await supabase
            .from('rag_documents')
            .update({ status: 'suspended_copyright' })
            .in('id', batch);
        if (error) console.error(`  ❌ Errore update status:`, error.message);
    }
}

// ══════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════

async function main() {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  🛡️  DE-VETTORIALIZZAZIONE RIVISTE — COPYRIGHT HOLD');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`  Modalità: ${EXECUTE ? '🔴 ESECUZIONE REALE' : '🟢 DRY RUN (solo audit)'}`);
    console.log('══════════════════════════════════════════════════════════════\n');

    const grandSummary = [];
    let grandTotalDocs = 0;
    let grandTotalChunksNullified = 0;

    for (const target of TARGETS) {
        console.log(`\n📚 ${target.label}`);
        console.log('─'.repeat(60));

        // 1) Trova documenti
        const docs = await target.query();
        console.log(`  📄 Documenti trovati: ${docs.length}`);

        if (docs.length === 0) {
            grandSummary.push({ label: target.label, docs: 0, totalChunks: 0, activeChunks: 0, nullified: 0 });
            continue;
        }

        // Mostra campione
        const sample = docs.slice(0, 3);
        sample.forEach(d => console.log(`     → ${d.titolo || d.filename} (${d.anno || '?'})`));
        if (docs.length > 3) console.log(`     ... e altri ${docs.length - 3}`);

        const docIds = docs.map(d => d.id);

        // 2) Conta chunk
        const totalChunks = await countTotalChunks(docIds);
        const activeChunks = await countActiveChunks(docIds);
        console.log(`  🔢 Chunk totali: ${totalChunks} | Con embedding attivo: ${activeChunks}`);

        if (activeChunks === 0) {
            console.log(`  ✅ Già de-vettorializzati.`);
            grandSummary.push({ label: target.label, docs: docs.length, totalChunks, activeChunks: 0, nullified: 0 });
            continue;
        }

        // 3) Esegui o simula
        if (EXECUTE) {
            console.log(`  ⏳ Nullificazione embedding...`);
            const { updated, errors } = await nullifyEmbeddings(docIds);
            console.log(`  ✅ Embedding nullificati: ${updated}${errors > 0 ? ` (⚠️ ${errors} errori)` : ''}`);

            console.log(`  ⏳ Aggiornamento status → "suspended_copyright"...`);
            await markDocumentsSuspended(docIds);
            console.log(`  ✅ Status aggiornato.`);

            grandTotalDocs += docs.length;
            grandTotalChunksNullified += updated;
            grandSummary.push({ label: target.label, docs: docs.length, totalChunks, activeChunks, nullified: updated });
        } else {
            console.log(`  🟡 DRY RUN: verrebbero nullificati ${activeChunks} embedding`);
            console.log(`  🟡 DRY RUN: ${docs.length} documenti → "suspended_copyright"`);
            grandSummary.push({ label: target.label, docs: docs.length, totalChunks, activeChunks, nullified: 'DRY RUN' });
        }
    }

    // ── RIEPILOGO ──
    console.log('\n\n══════════════════════════════════════════════════════════════');
    console.log('  📊 RIEPILOGO FINALE');
    console.log('══════════════════════════════════════════════════════════════');
    for (const s of grandSummary) {
        console.log(`\n  📚 ${s.label}`);
        console.log(`     Documenti: ${s.docs} | Chunk totali: ${s.totalChunks} | Attivi: ${s.activeChunks} | Nullificati: ${s.nullified}`);
    }
    console.log('\n──────────────────────────────────────────────────────────────');

    if (EXECUTE) {
        console.log(`  ✅ TOTALE: ${grandTotalDocs} documenti sospesi, ${grandTotalChunksNullified} embedding rimossi`);
        console.log('  ℹ️  Dati preservati — solo embedding nullificati.');
        console.log('  ℹ️  Per ri-vettorializzare: ri-lanciare gli script di ingest.\n');
    } else {
        const hasWork = grandSummary.some(s => s.activeChunks > 0);
        if (hasWork) {
            console.log('\n  ⚡ Per eseguire, lancia con --execute:');
            console.log('     node scripts/devectorize_riviste_copyright.js --execute\n');
        } else {
            console.log('\n  ✅ Niente da fare — tutto già de-vettorializzato.\n');
        }
    }
}

main().catch(err => {
    console.error('❌ Errore fatale:', err);
    process.exit(1);
});
