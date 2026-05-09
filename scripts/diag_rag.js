import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log("📊 Diagnostica Database RAG (rag_chunks)");
    console.log("------------------------------------------");
    
    // Conteggio per materia
    const { data: allMateria, error } = await supabase
        .from('rag_chunks')
        .select('materia');

    if (error) {
        console.error("Errore:", error);
        return;
    }

    const counts = {};
    allMateria.forEach(d => { 
        counts[d.materia] = (counts[d.materia] || 0) + 1; 
    });

    console.log("Distribuzione per Materia (Case Sensitive):");
    console.log(JSON.stringify(counts, null, 2));

    // Controllo campioni per ogni materia trovata
    console.log("\n--- Campioni per Materia ---");
    for (const mat in counts) {
        const { data: sample } = await supabase
            .from('rag_chunks')
            .select('materia, tipo, content')
            .eq('materia', mat)
            .limit(1);
        if (sample && sample[0]) {
            console.log(`[${mat}]: ${sample[0].tipo} - ${sample[0].content.substring(0, 50)}...`);
        }
    }

    // Esempio di un record per vedere i metadati
    const { data: sample } = await supabase.from('rag_chunks').select('*').limit(1);
    if (sample && sample[0]) {
        console.log("\nEsempio Metadati Record:");
        const { embedding, ...rest } = sample[0];
        console.log(rest);
    }
}

checkData();
