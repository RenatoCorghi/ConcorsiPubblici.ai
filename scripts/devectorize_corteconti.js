/**
 * DE-VETTORIALIZZAZIONE — Rivista Corte dei Conti
 * 
 * Targets:
 *   1. editore = 'Rivista Corte dei Conti' (132 docs)
 *   2. editore NULL + titolo LIKE '%corteconti%' (residui senza editore)
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

const TARGETS = [
    {
        label: 'Rivista Corte dei Conti (editore esplicito)',
        query: async () => {
            const docs = [];
            let offset = 0;
            while (true) {
                const { data } = await supabase.from('rag_documents')
                    .select('id, titolo, filename, anno')
                    .eq('editore', 'Rivista Corte dei Conti')
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
        label: 'Corte dei Conti (editore NULL, titolo corteconti)',
        query: async () => {
            const docs = [];
            let offset = 0;
            while (true) {
                const { data } = await supabase.from('rag_documents')
                    .select('id, titolo, filename, anno')
                    .is('editore', null)
                    .ilike('titolo', '%corteconti%')
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

async function countActiveChunks(docIds) {
    let total = 0;
    for (let i = 0; i < docIds.length; i += 200) {
        const batch = docIds.slice(i, i + 200);
        const { count } = await supabase.from('rag_chunks')
            .select('id', { count: 'exact', head: true })
            .in('document_id', batch)
            .not('embedding', 'is', null);
        total += count || 0;
    }
    return total;
}

async function nullifyEmbeddings(docIds) {
    let updated = 0;
    for (let i = 0; i < docIds.length; i += 200) {
        const batch = docIds.slice(i, i + 200);
        const { data } = await supabase.from('rag_chunks')
            .update({ embedding: null })
            .in('document_id', batch)
            .not('embedding', 'is', null)
            .select('id');
        updated += data ? data.length : 0;
    }
    return updated;
}

async function markSuspended(docIds) {
    for (let i = 0; i < docIds.length; i += 200) {
        const batch = docIds.slice(i, i + 200);
        await supabase.from('rag_documents')
            .update({ status: 'suspended_copyright' })
            .in('id', batch);
    }
}

async function main() {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  🛡️  DE-VETTORIALIZZAZIONE — RIVISTA CORTE DEI CONTI');
    console.log(`  Modalità: ${EXECUTE ? '🔴 ESECUZIONE REALE' : '🟢 DRY RUN'}`);
    console.log('══════════════════════════════════════════════════════════════\n');

    let grandTotal = 0;

    for (const target of TARGETS) {
        console.log(`\n📚 ${target.label}`);
        console.log('─'.repeat(60));

        const docs = await target.query();
        console.log(`  📄 Documenti: ${docs.length}`);
        if (docs.length === 0) continue;

        docs.slice(0, 3).forEach(d => console.log(`     → ${d.titolo} (${d.anno || '?'})`));
        if (docs.length > 3) console.log(`     ... e altri ${docs.length - 3}`);

        const docIds = docs.map(d => d.id);
        const active = await countActiveChunks(docIds);
        console.log(`  🔢 Chunk con embedding attivo: ${active}`);

        if (active === 0) { console.log(`  ✅ Già de-vettorializzati.`); continue; }

        if (EXECUTE) {
            const updated = await nullifyEmbeddings(docIds);
            console.log(`  ✅ Embedding nullificati: ${updated}`);
            await markSuspended(docIds);
            console.log(`  ✅ Status → suspended_copyright`);
            grandTotal += updated;
        } else {
            console.log(`  🟡 DRY RUN: ${active} embedding da nullificare`);
        }
    }

    console.log('\n══════════════════════════════════════════════════════════════');
    if (EXECUTE) console.log(`  ✅ Totale embedding rimossi: ${grandTotal}`);
    else console.log('  ⚡ Per eseguire: node scripts/devectorize_corteconti.js --execute');
    console.log('══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
