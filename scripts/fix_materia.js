import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const MAPS = [
    { from: 'amministrativo', to: 'Diritto Amministrativo' },
    { from: 'Amministrativo', to: 'Diritto Amministrativo' },
    { from: 'civile', to: 'Diritto Civile' },
    { from: 'penale', to: 'Diritto Penale' },
    { from: 'procedura civile', to: 'Diritto Processuale Civile' },
    { from: 'procedura penale', to: 'Diritto Processuale Penale' }
];

async function fix() {
    console.log("🛠️  AVVIO NORMALIZZAZIONE MATERIE (Database Completo)");
    
    for (const map of MAPS) {
        console.log(`\n🔄 Conversione: "${map.from}" -> "${map.to}"`);

        // 1. Update rag_documents
        const { count: docCount, error: docErr } = await supabase
            .from('rag_documents')
            .update({ materia: map.to })
            .eq('materia', map.from)
            .select('*', { count: 'exact', head: true });

        if (docErr) console.error(`   ❌ Errore documenti:`, docErr.message);
        else console.log(`   ✅ Documenti aggiornati: ${docCount || 0}`);

        // 2. Update rag_chunks (In batch per evitare timeout)
        let totalChunks = 0;
        while (true) {
            const { data: chunks, error: chunkErr } = await supabase
                .from('rag_chunks')
                .select('id')
                .eq('materia', map.from)
                .limit(500);

            if (chunkErr) { console.error(`   ❌ Errore chunks:`, chunkErr.message); break; }
            if (!chunks || chunks.length === 0) break;

            const ids = chunks.map(c => c.id);
            const { error: upErr } = await supabase
                .from('rag_chunks')
                .update({ materia: map.to })
                .in('id', ids);

            if (upErr) { console.error(`   ❌ Errore aggiornamento batch:`, upErr.message); break; }
            totalChunks += ids.length;
            process.stdout.write(`.`);
        }
        console.log(`\n   ✅ Chunks aggiornati: ${totalChunks}`);
    }

    console.log("\n✨ NORMALIZZAZIONE COMPLETATA!");
}

fix();
