import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(l => { const m = l.match(/^([^#=]+)=(.*)$/); if (m) envVars[m[1].trim()] = m[2].trim(); });

const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_KEY);

async function main() {
    console.log("🔄 Avvio ricostruzione HNSW via RPC...");
    
    // 1. Drop
    console.log("🗑️ Dropping index...");
    let { error: err1 } = await supabase.rpc('exec_sql', { query_text: "DROP INDEX IF EXISTS idx_rag_chunks_embedding_hnsw;" });
    if (err1) {
        console.error("❌ Errore Drop:", err1.message);
        return;
    }
    
    // 2. Create
    console.log("🛠️ Creating HNSW index (potrebbe richiedere 30-60s)...");
    let { error: err2 } = await supabase.rpc('exec_sql', { query_text: "CREATE INDEX idx_rag_chunks_embedding_hnsw ON rag_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);" });
    if (err2) {
        console.error("❌ Errore Create:", err2.message);
        return;
    }
    
    // 3. Analyze
    console.log("🧹 Running VACUUM ANALYZE...");
    let { error: err3 } = await supabase.rpc('exec_sql', { query_text: "VACUUM ANALYZE rag_chunks;" });
    if (err3) {
        // sometimes VACUUM cannot run in a function context, we ignore it
        console.log("⚠️ Vacuum error (normale via RPC):", err3.message);
    }

    console.log("✅ HNSW Index Ricostruito con successo!");
}

main().catch(console.error);
