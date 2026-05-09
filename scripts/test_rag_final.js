import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeMateria(inputMateria) {
    if (!inputMateria) return null;
    const str = inputMateria.toLowerCase().trim();
    if (str.includes('amministrativ')) return 'Diritto Amministrativo';
    if (str.includes('costituzional')) return 'Diritto Costituzionale';
    if ((str.includes('procedura') || str.includes('processuale')) && str.includes('penal')) return 'Diritto Processuale Penale';
    if ((str.includes('procedura') || str.includes('processuale')) && str.includes('civil')) return 'Diritto Processuale Civile';
    if (str.includes('penal')) return 'Diritto Penale';
    if (str.includes('civil')) return 'Diritto Civile';
    return inputMateria.replace(/\b\w/g, l => l.toUpperCase());
}

async function runFinalDiagnostics() {
    console.log("🌌 ULTIMO STRESS TEST RAG DELLA NOTTE...");
    
    const queries = [
        // Uso appositamente nomi NON standard per attivare il normalizzatore
        { q: "Impugnazione del lodo arbitrale rituale e poteri del giudice", m: "procedura civile" },
        { q: "Il giudizio abbreviato condizionato e le nuove prove", m: "Diritto Processuale Penale" },
        { q: "La trascrizione del contratto preliminare e l'effetto prenotativo", m: "civile" },
        { q: "Il concorso anomalo nel reato ex art 116 e la prevedibilità dell'evento", m: "Diritto Penale" }
    ];

    for (const test of queries) {
        const normalized = normalizeMateria(test.m);
        console.log(`\n--- Test: "${test.q}" [Filtro inviato: "${test.m}" -> Normalizzato in: "${normalized}"] ---`);
        try {
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
                filter_materia: normalized
            });
            
            if (error) {
                console.log("❌ Errore RPC:", error.message);
            } else if (!matches || matches.length === 0) {
                console.log(`⚠️ Nessun risultato! (La materia è probabilmente vuota)`);
            } else {
                console.log(`✅ Trovati ${matches.length} risultati.`);
                matches.forEach((m, i) => {
                    console.log(`   [${m.tipo}] Sim: ${(m.similarity * 100).toFixed(1)}% | ${m.content.substring(0, 150).replace(/\n/g, ' ')}...`);
                });
            }
        } catch(e) {
            console.log("Errore:", e.message);
        }
    }
}

runFinalDiagnostics();
