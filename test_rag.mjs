import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const API_KEY = env.GEMINI_API_KEY;
const SUPA_URL = env.SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_KEY;

async function getEmbedding(text) {
    const embedUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=' + API_KEY;
    const res = await fetch(embedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text: text }] },
            outputDimensionality: 768
        })
    });
    const data = await res.json();
    return data.embedding.values;
}

async function searchRAG(queryText) {
    console.log('Query:', queryText);
    const vector = await getEmbedding(queryText);
    
    const rpcPayload = {
        query_embedding: vector,
        match_count: 6,
        similarity_threshold: 0.65,
        filter_materia: 'Amministrativo'
    };

    const rpcUrl = SUPA_URL + '/rest/v1/rpc/search_knowledge';
    const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
            'apikey': SUPA_KEY,
            'Authorization': 'Bearer ' + SUPA_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(rpcPayload)
    });
    
    const matches = await res.json();
    console.log('Trovati', matches.length, 'frammenti.');
    matches.forEach((m, i) => {
        console.log(`\n--- FRAMMENTO ${i+1} [${m.tipo}] (Sim. ${m.similarity.toFixed(2)}) ---`);
        console.log(m.content.substring(0, 400) + '...');
    });
}

searchRAG("L'autotutela amministrativa e il 21-nonies");
