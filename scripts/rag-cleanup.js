import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Carica .env
try {
    const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    });
} catch (e) {}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

// I titoli esatti come appaiono nel DB (SOLO I DUE CODICI DI PROCEDURA)
// ⚠️ NON tocca: Codice Civile, Codice Penale, dottrina_sintetica
const TITOLI_DA_CANCELLARE = [
    'REGIO DECRETO 28 ottobre 1940 n. 1443',     // Codice di Procedura Civile
    'DECRETO DEL PRESIDENTE DELLA REPUBBLICA 22 settembre 1988 n. 447', // Codice di Procedura Penale
];

async function cleanup() {
    console.log('🧹 Avvio pulizia database RAG...\n');

    for (const titolo of TITOLI_DA_CANCELLARE) {
        console.log(`🔍 Cerco: "${titolo}"...`);

        // Trova tutti i documenti con questo titolo
        const { data: docs, error: findErr } = await supabase
            .from('rag_documents')
            .select('id, titolo')
            .eq('titolo', titolo);

        if (findErr) { console.error(`❌ Errore ricerca:`, findErr.message); continue; }
        if (!docs || docs.length === 0) { console.log(`ℹ️ Nessun documento trovato per questo titolo.\n`); continue; }

        console.log(`   → Trovati ${docs.length} documento/i.`);

        for (const doc of docs) {
            // Prima cancella i chunks associati
            const { error: chunkErr, count } = await supabase
                .from('rag_chunks')
                .delete()
                .eq('document_id', doc.id);

            if (chunkErr) { console.error(`   ❌ Errore cancellazione chunks per doc ${doc.id}:`, chunkErr.message); continue; }
            console.log(`   🗑️  Chunks del documento ${doc.id} eliminati.`);

            // Poi cancella il documento
            const { error: docErr } = await supabase
                .from('rag_documents')
                .delete()
                .eq('id', doc.id);

            if (docErr) { console.error(`   ❌ Errore cancellazione documento:`, docErr.message); continue; }
            console.log(`   ✅ Documento "${titolo}" (${doc.id}) eliminato.\n`);
        }
    }

    console.log('🎉 Pulizia completata! Il database è pronto per una nuova ingestione pulita.');
}

cleanup();
