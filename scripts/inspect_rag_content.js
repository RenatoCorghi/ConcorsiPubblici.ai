import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function inspect() {
    console.log("🔬 ISPEZIONE CONTENUTO RAG — Cosa vede l'AI?\n");
    console.log("═".repeat(80));

    // Genera lo stesso embedding della lezione
    const query = "autotutela amministrativa annullamento d'ufficio art 21 nonies";
    const embedRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text: query }] },
                outputDimensionality: 768
            })
        }
    );
    const embedData = await embedRes.json();
    const vector = embedData.embedding?.values;

    const { data: results } = await supabase.rpc('match_rag_chunks', {
        query_embedding: vector,
        match_count: 6,
        match_threshold: 0.60,
        filter_materia: 'Diritto Amministrativo'
    });

    for (const [i, r] of (results || []).entries()) {
        console.log(`\n${"─".repeat(80)}`);
        console.log(`📄 RISULTATO ${i+1} | similarity: ${r.similarity?.toFixed(3)} | materia: ${r.materia}`);
        console.log(`   titolo campo: ${r.titolo || '(vuoto)'}`);
        console.log(`${"─".repeat(80)}`);
        
        // Mostra il CONTENUTO INTEGRALE che l'AI riceve
        const content = r.content || '';
        console.log(`\n${content.substring(0, 1500)}`);
        if (content.length > 1500) console.log(`\n... [TRONCATO — totale ${content.length} caratteri]`);
        
        // Analisi: contiene un numero di sentenza chiaro?
        const hasNumero = /(?:sentenza|ordinanza|decreto)\s*(?:n\.?|numero)\s*\d+/i.test(content);
        const hasData = /\d{4}-\d{2}-\d{2}/.test(content);
        const hasDocId = /Documento:\s*\w+\s*\d{4}\s*\d+/.test(content);
        const hasMassima = /massima|principio di diritto|ratio decidendi/i.test(content);
        const hasMotivazione = /considerato|ritenuto|per questi motivi|in diritto/i.test(content);
        
        console.log(`\n   📊 ANALISI QUALITÀ:`);
        console.log(`      Numero sentenza esplicito: ${hasNumero ? '✅' : '❌'}`);
        console.log(`      Data depositio:            ${hasData ? '✅' : '❌'}`);
        console.log(`      Solo ID documento interno:  ${hasDocId ? '⚠️ SÌ' : '✅ NO'}`);
        console.log(`      Contiene massima/principio: ${hasMassima ? '✅' : '❌'}`);
        console.log(`      Contiene motivazione:       ${hasMotivazione ? '✅' : '❌'}`);
    }

    console.log(`\n${"═".repeat(80)}`);
    console.log("FINE ISPEZIONE");
}

inspect().catch(e => console.error(e));
