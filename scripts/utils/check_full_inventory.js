import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("📊 INVENTARIO COMPLETO RAG\n");

    // 1. Materie e conteggi chunks
    const { data: materie } = await supabase.rpc('get_materia_stats'); // Se esiste la RPC
    
    // Se non esiste la RPC, usiamo una query aggregata
    if (!materie) {
        const { data: rawData, error } = await supabase
            .from('rag_chunks')
            .select('materia');
        
        if (error) {
            console.error("Errore query:", error.message);
            return;
        }

        const stats = {};
        rawData.forEach(r => {
            stats[r.materia] = (stats[r.materia] || 0) + 1;
        });
        console.log("--- Chunks per Materia ---");
        console.table(stats);
    }

    // 2. Documenti per tipo
    const { data: docs } = await supabase
        .from('rag_documents')
        .select('tipo, materia');
    
    const docStats = {};
    docs.forEach(d => {
        const key = `${d.tipo} (${d.materia})`;
        docStats[key] = (docStats[key] || 0) + 1;
    });
    console.log("\n--- Documenti per Tipo e Materia ---");
    console.table(docStats);

    // 3. Verifica "amministrativo" vs "Diritto Amministrativo"
    const { count: countLower } = await supabase
        .from('rag_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('materia', 'amministrativo');
    
    const { count: countCanon } = await supabase
        .from('rag_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('materia', 'Diritto Amministrativo');

    console.log(`\n⚠️  Alert Incoerenza:`);
    console.log(`   - 'amministrativo': ${countLower}`);
    console.log(`   - 'Diritto Amministrativo': ${countCanon}`);
}

check();
