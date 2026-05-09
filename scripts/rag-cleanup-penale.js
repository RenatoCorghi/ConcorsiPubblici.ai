import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

try {
    const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    });
} catch (e) {}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

// ⚠️ Cancella SOLO i vettori del Codice di Procedura Penale
// NON tocca: Civile, Penale sostanziale, Dottrina
const TITOLI_DA_CANCELLARE = [
    'DECRETO DEL PRESIDENTE DELLA REPUBBLICA 22 settembre 1988 n. 447', // Codice di Procedura Penale
];

async function cleanup() {
    console.log('🧹 Avvio pulizia SOLO Procedura Penale...\n');

    for (const titolo of TITOLI_DA_CANCELLARE) {
        console.log(`🔍 Cerco: "${titolo}"...`);

        const { data: docs, error: findErr } = await supabase
            .from('rag_documents')
            .select('id, titolo')
            .eq('titolo', titolo);

        if (findErr) { console.error(`❌ Errore:`, findErr.message); continue; }
        if (!docs || docs.length === 0) { console.log(`ℹ️ Nessun documento trovato.\n`); continue; }

        console.log(`   → Trovati ${docs.length} documento/i.`);

        for (const doc of docs) {
            const { error: chunkErr } = await supabase
                .from('rag_chunks')
                .delete()
                .eq('document_id', doc.id);

            if (chunkErr) { console.error(`   ❌ Errore chunks:`, chunkErr.message); continue; }
            console.log(`   🗑️  Chunks eliminati per doc ${doc.id}`);

            const { error: docErr } = await supabase
                .from('rag_documents')
                .delete()
                .eq('id', doc.id);

            if (docErr) { console.error(`   ❌ Errore documento:`, docErr.message); continue; }
            console.log(`   ✅ Documento eliminato.\n`);
        }
    }

    console.log('🎉 Pulizia completata. Ora puoi reingerire il Procedura Penale.');
}

cleanup();
