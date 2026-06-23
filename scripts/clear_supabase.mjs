import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function clearDatabase() {
    console.log("🧹 Inizio pulizia database vettoriale (rag_chunks e rag_documents)...");
    
    // In Supabase, per eliminare tutti i record tramite l'API js si usa un filtro sempre vero
    // come .neq('id', '00000000-0000-0000-0000-000000000000')

    const { error: chunkError } = await supabase
        .from('rag_chunks')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
        
    if (chunkError) {
        console.error("❌ Errore durante l'eliminazione dei chunks:", chunkError);
    } else {
        console.log("✅ Tabella rag_chunks svuotata con successo.");
    }

    const { error: docError } = await supabase
        .from('rag_documents')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (docError) {
        console.error("❌ Errore durante l'eliminazione dei documenti:", docError);
    } else {
        console.log("✅ Tabella rag_documents svuotata con successo.");
    }
    
    console.log("🚀 Pulizia completata! Il RAG è pronto per accogliere le sentenze della Cassazione.");
}

clearDatabase();
