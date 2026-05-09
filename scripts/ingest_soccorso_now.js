import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import crypto from 'crypto';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(l => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// Leggi il file
const raw = fs.readFileSync('riviste_vip_schede/giurit_2024_5/giurit_2024_5_pages_31_to_45.md', 'utf8');

// Splitta e cerca la scheda soccorso istruttorio
const parts = raw.split(/(?:---\s*\n\s*)?🧾\s*METADATI\s*RAG/i);
let soccorsoCard = null;
for (const p of parts) {
    if (p.toLowerCase().includes('soccorso istruttorio') && p.includes('Istituto Principale')) {
        soccorsoCard = p
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/^Fonte ispiratrice:.*$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        break;
    }
}

if (!soccorsoCard) {
    console.log('❌ Scheda soccorso non trovata!');
    process.exit(1);
}

const content = '🧾 METADATI RAG\n' + soccorsoCard;
console.log('Trovata scheda, lunghezza:', content.length, 'caratteri');
console.log('Preview:\n', content.substring(0, 400), '\n...\n');

// Embedding
const embRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${env.GEMINI_API_KEY}`,
    {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text: content }] },
            outputDimensionality: 768
        })
    }
);
const embData = await embRes.json();
if (!embData.embedding) {
    console.log('❌ Embedding fallito:', JSON.stringify(embData));
    process.exit(1);
}
const embedding = embData.embedding.values;
console.log('Embedding generato, dimensione:', embedding.length);

const uuid = crypto.createHash('sha256')
    .update('soccorso_istruttorio_giurit_2024_5_clean')
    .digest('hex')
    .substring(0, 32)
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

// Inserisci documento
const { error: docErr } = await supabase.from('rag_documents').upsert({
    id: uuid,
    titolo: 'Soccorso Istruttorio e Appalti PNRR - Art. 101 D.Lgs. 36/2023',
    materia: 'Dottrina e Teoria Generale',
    tipo: 'massimario_teoria',
    autore: 'Giurisprudenza Italiana 2024/5',
    filename: 'giurit_2024_5_soccorso_istruttorio.md',
    status: 'completed'
});
if (docErr) console.log('⚠️ Doc:', docErr.message);

// Inserisci chunk
const { error: chunkErr } = await supabase.from('rag_chunks').upsert({
    document_id: uuid,
    content: content,
    chunk_index: 0,
    materia: 'Dottrina e Teoria Generale',
    tipo: 'teoria_massimario',
    embedding: embedding
});

if (chunkErr) console.log('❌ Chunk:', chunkErr.message);
else console.log('✅ Scheda "Soccorso Istruttorio" ingerita con successo!');
