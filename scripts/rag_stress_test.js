import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;

const queries = [
    {
        id: 1,
        name: "Silenzio Assenso (Ad. Plen. 8/2022)",
        query: "Il silenzio assenso ex art. 20 della l. 241/1990 si forma anche quando l'istanza del privato è carente dei requisiti sostanziali richiesti dalla legge per il rilascio del provvedimento? Come ha risolto la giurisprudenza amministrativa recente la tensione tra il principio di certezza dei traffici giuridici e la legalità sostanziale in questo caso?"
    },
    {
        id: 2,
        name: "SCIA e Tutela del Terzo (Art. 19, comma 6-ter)",
        query: "In tema di SCIA (Segnalazione Certificata di Inizio Attività), come si atteggia la tutela del terzo controinteressato? Considerando che la SCIA è un atto del privato e non della P.A., quali strumenti processuali ha il terzo per tutelarsi se l'Amministrazione rimane inerte e fa decorrere il termine per l'esercizio del potere inibitorio?"
    },
    {
        id: 3,
        name: "Accesso agli Atti vs FOIA (Ad. Plen. 10/2020)",
        query: "Quali sono i confini dogmatici e operativi tra l'accesso documentale difensivo (L. 241/90) e l'accesso civico generalizzato (D.lgs. 33/2013) in materia di contratti pubblici? Può l'accesso civico generalizzato essere utilizzato dal concorrente sconfitto come strumento 'esplorativo' per superare i limiti rigorosi dell'accesso difensivo?"
    },
    {
        id: 4,
        name: "Soccorso Istruttorio (Punto di Caduta)",
        query: "Nel diritto dei contratti pubblici, qual è il 'punto di caduta' del soccorso istruttorio rispetto all'offerta tecnica? In quali casi la giurisprudenza amministrativa ritiene che l'integrazione documentale richiesta dalla P.A. si trasformi in un'inammissibile modificazione dell'offerta, determinando un vulnus al principio della par condicio dei concorrenti?"
    }
];

async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text }] },
            outputDimensionality: 768
        })
    });
    const data = await response.json();
    return data.embedding.values;
}

async function runTest() {
    console.log("# 🔬 REPORT STRESS TEST RAG — ConcorsiPubblici.ai\n");
    
    for (const q of queries) {
        console.log(`## Test ${q.id}: ${q.name}`);
        console.log(`**Query:** ${q.query}\n`);
        
        try {
            const vector = await getEmbedding(q.query);
            
            const { data: matches, error } = await supabase.rpc('match_rag_chunks', {
                query_embedding: vector,
                match_threshold: 0.5,
                match_count: 5
            });
            
            if (error) throw error;
            
            if (!matches || matches.length === 0) {
                console.log("❌ **RISULTATO:** Nessun match trovato nel database.");
            } else {
                console.log("| Sede/Tipo | Titolo Documento | Similarità |");
                console.log("|---|---|---|");
                matches.forEach(m => {
                    console.log(`| ${m.materia} | ${m.titolo} | ${(m.similarity * 100).toFixed(2)}% |`);
                });
                
                console.log("\n**Top Snippet (Content):**");
                console.log("```text");
                console.log(matches[0].content.substring(0, 500) + "...");
                console.log("```\n");
                
                // Verifica parole chiave specifiche
                const contentLower = matches.map(m => m.content.toLowerCase()).join(' ');
                const keywords = {
                    1: ["plenaria", "8/2022", "241", "requisiti"],
                    2: ["6-ter", "inibitorio", "terzo"],
                    3: ["10/2020", "foia", "civico", "difensivo"],
                    4: ["tecnica", "par condicio", "modificazione"]
                };
                
                const found = keywords[q.id].filter(k => contentLower.includes(k.toLowerCase()));
                console.log(`**Keywords trovate:** ${found.length > 0 ? found.join(', ') : 'Nessuna'}\n`);
            }
        } catch (e) {
            console.log(`❌ Errore: ${e.message}`);
        }
        console.log("---\n");
    }
}

runTest();
