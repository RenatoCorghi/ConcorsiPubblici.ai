import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Simulazione del normalizzatore del proxy
function normalizeMateria(input) {
    if (!input) return null;
    const str = input.toLowerCase().trim();
    if (str.includes('amministrativ')) return 'Diritto Amministrativo';
    if ((str.includes('procedura') || str.includes('processuale')) && str.includes('penal')) return 'Diritto Processuale Penale';
    if ((str.includes('procedura') || str.includes('processuale')) && str.includes('civil')) return 'Diritto Processuale Civile';
    if (str.includes('penal')) return 'Diritto Penale';
    if (str.includes('civil')) return 'Diritto Civile';
    return input;
}

async function testRAG(query, materiaInviata) {
    const materiaCanonitizzata = normalizeMateria(materiaInviata);
    console.log(`\n🔍 QUERY: "${query}"`);
    console.log(`🎯 MATERIA: "${materiaInviata}" -> CANONICA: "${materiaCanonitizzata}"`);

    // 1. Embedding
    const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text: query }] },
            outputDimensionality: 768
        })
    });
    const embedData = await embedRes.json();
    const vector = embedData.embedding?.values;
    if (!vector) { console.log("❌ Errore embedding"); return; }

    // 2. Ricerca
    const { data: matches, error } = await supabase.rpc('search_knowledge', {
        query_embedding: vector,
        match_count: 6,
        similarity_threshold: 0.50,
        filter_materia: materiaCanonitizzata
    });

    if (error) {
        console.log("❌ Errore DB:", error.message);
    } else if (!matches || matches.length === 0) {
        console.log("⚠️ Nessun risultato trovato.");
    } else {
        console.log(`✅ Trovati ${matches.length} risultati:`);
        matches.forEach((m, i) => {
            console.log(`   [${m.tipo}] Sim: ${(m.similarity * 100).toFixed(1)}% | ${m.content.substring(0, 160).replace(/\n/g, ' ')}...`);
        });
    }
}

async function run() {
    console.log("🏫 TEST LEZIONE: L'autotutela amministrativa");
    console.log("---------------------------------------------------------");

    await testRAG("L'autotutela amministrativa: annullamento d'ufficio, revoca e convalida del provvedimento", "Diritto Amministrativo");
}

run();
