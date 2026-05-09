import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runDiagnostics() {
    console.log("🔍 Esecuzione Diagnostica Avanzata RAG...");
    
    // 1. Statistiche per Materia
    console.log("\n📊 Conteggio Esatto per Materia (Raggruppamento SQL):");
    const { data: materie, error: matError } = await supabase.rpc('get_materie_stats'); 
    // Se non esiste l'RPC, usiamo un trucchetto limitato
    if (matError) {
        // Fallback: scarica solo materia e raggruppa localmente (con limit)
        const { data: allChunks } = await supabase.from('rag_chunks').select('materia, tipo');
        if (allChunks) {
            const matCount = {};
            const tipoCount = {};
            allChunks.forEach(c => {
                matCount[c.materia] = (matCount[c.materia] || 0) + 1;
                tipoCount[c.tipo] = (tipoCount[c.tipo] || 0) + 1;
            });
            console.log("Materie:", matCount);
            console.log("\n📊 Conteggio per Tipo Documento:");
            console.log("Tipi:", tipoCount);
        }
    }

    // 2. Stress Test su Queries Complesse
    console.log("\n🚀 Inizio Stress Test Semantico...");
    
    const queries = [
        { q: "Principio di conservazione del contratto e nullità parziale", m: "Diritto Civile" },
        { q: "Differenza tra dolo eventuale e colpa cosciente nel sinistro stradale", m: "Diritto Penale" },
        { q: "L'eccesso di potere per sviamento della funzione amministrativa", m: "Diritto Amministrativo" },
        { q: "Impugnazione del lodo arbitrale rituale", m: "Diritto Processuale Civile" } // Vediamo se esiste questa materia!
    ];

    for (const test of queries) {
        console.log(`\n--- Test: "${test.q}" [${test.m}] ---`);
        try {
            // Genera embedding
            const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/gemini-embedding-2',
                    content: { parts: [{ text: test.q }] },
                    outputDimensionality: 768
                })
            });
            const embedData = await embedRes.json();
            const vector = embedData.embedding?.values;
            
            if (!vector) {
                console.log("❌ Errore embedding"); continue;
            }

            const { data: matches, error } = await supabase.rpc('search_knowledge', {
                query_embedding: vector,
                match_count: 2,
                similarity_threshold: 0.50,
                filter_materia: test.m
            });
            
            if (error) {
                console.log("❌ Errore RPC:", error.message);
            } else if (!matches || matches.length === 0) {
                console.log(`⚠️ Nessun risultato! (La materia '${test.m}' esiste o è popolata?)`);
            } else {
                console.log(`✅ Trovati ${matches.length} risultati.`);
                matches.forEach((m, i) => {
                    console.log(`   [${m.tipo}] Sim: ${(m.similarity * 100).toFixed(1)}% | ${m.content.substring(0, 80).replace(/\n/g, ' ')}...`);
                });
            }
        } catch(e) {
            console.log("Errore:", e.message);
        }
    }
}

runDiagnostics();
