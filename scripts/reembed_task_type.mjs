// ============================================================
// Re-embed dell'intero corpus rag_chunks con taskType RETRIEVAL_DOCUMENT.
//
// PERCHÉ: gli embedding attuali sono stati generati senza task type.
// Gemini supporta embedding asimmetrici (RETRIEVAL_DOCUMENT per il corpus,
// RETRIEVAL_QUERY per le query): la coppia tipizzata migliora il retrieval.
// I due spazi NON sono mescolabili a metà — quindi:
//
//   1. Esegui questo script FINO IN FONDO (riprendibile: checkpoint su file)
//   2. SOLO DOPO, imposta su Vercel: RAG_QUERY_TASK_TYPE=RETRIEVAL_QUERY
//      (api/proxy.js la legge e tipizza le query di conseguenza)
//
// Durante l'esecuzione il corpus è "misto" ma la ricerca continua a
// funzionare (le query restano non tipizzate finché non imposti l'env).
//
// USO:
//   node scripts/reembed_task_type.mjs --dry-run        # stima senza scrivere
//   node scripts/reembed_task_type.mjs --limit 200      # prova su 200 chunk
//   node scripts/reembed_task_type.mjs                  # tutto il corpus
//
// In caso di interruzione, rilancia: riparte dal checkpoint
// (scripts/.reembed_checkpoint.json). Per ripartire da zero, cancella il file.
// ============================================================
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY || env.GOOGLE_AI_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
    console.error('❌ .env incompleto: servono SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY');
    process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
const BATCH_SIZE = 50;          // max 100 per batchEmbedContents
const SLEEP_MS = 400;           // pausa tra batch (rate limit)
const PATCH_CONCURRENCY = 4;    // PATCH paralleli verso Supabase (basso per evitare ECONNRESET su Windows)
const FETCH_TIMEOUT_MS = 30000; // un fetch appeso non deve bloccare lo script per sempre
const MAX_RETRIES = 8;          // per blip transitori di rete (fino a ~5 min totali di backoff)

const CHECKPOINT_FILE = 'scripts/.reembed_checkpoint.json';
const SB_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
};

function loadCheckpoint() {
    try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')); }
    catch { return { lastId: null, processed: 0 }; }
}
function saveCheckpoint(cp) {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Riprova con backoff crescente su errori transitori (timeout, ECONNRESET,
// 5xx). Dopo MAX_RETRIES rilancia l'errore: a quel punto è probabile un
// problema persistente (chiave sbagliata, servizio giù) e il checkpoint
// salvato permette comunque di rilanciare lo script senza perdite.
async function withRetry(fn, label) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (e) {
            if (attempt > MAX_RETRIES) throw e;
            const backoff = Math.min(4000 * attempt, 60000);
            console.warn(`\n   ⚠️ ${label} (tentativo ${attempt}/${MAX_RETRIES}): ${e.message.substring(0, 150)} — retry tra ${(backoff / 1000).toFixed(0)}s`);
            await sleep(backoff);
        }
    }
}

async function fetchBatch(lastId) {
    let url = `${SUPABASE_URL}/rest/v1/rag_chunks?select=id,content&order=id.asc&limit=${BATCH_SIZE}`;
    if (lastId) url += `&id=gt.${lastId}`;
    const r = await fetch(url, { headers: SB_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`Fetch chunk fallita: ${r.status} ${await r.text()}`);
    return r.json();
}

async function embedBatch(texts) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        body: JSON.stringify({
            requests: texts.map(text => ({
                model: 'models/gemini-embedding-2',
                content: { parts: [{ text }] },
                taskType: 'RETRIEVAL_DOCUMENT',
                outputDimensionality: 768
            }))
        })
    });
    const data = await r.json();
    if (!data.embeddings || data.embeddings.length !== texts.length) {
        throw new Error(JSON.stringify(data).substring(0, 300));
    }
    return data.embeddings.map(e => e.values);
}

async function patchEmbedding(id, embedding) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rag_chunks?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        body: JSON.stringify({ embedding })
    });
    if (!r.ok) throw new Error(`PATCH ${id} fallita: ${r.status} ${await r.text()}`);
}

// Pool di PATCH a concorrenza limitata
async function patchAll(rows, vectors) {
    let idx = 0;
    async function worker() {
        while (idx < rows.length) {
            const i = idx++;
            await patchEmbedding(rows[i].id, vectors[i]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(PATCH_CONCURRENCY, rows.length) }, worker));
}

// --- MAIN ---
const countRes = await fetch(`${SUPABASE_URL}/rest/v1/rag_chunks?select=id&limit=1`, {
    headers: { ...SB_HEADERS, Prefer: 'count=exact', Range: '0-0' }
});
const total = parseInt((countRes.headers.get('content-range') || '/0').split('/')[1], 10);

const cp = loadCheckpoint();
console.log(`🚀 Re-embed corpus con taskType RETRIEVAL_DOCUMENT`);
console.log(`   Corpus totale: ${total} chunk | già processati (checkpoint): ${cp.processed}`);
if (DRY_RUN) console.log('   MODALITÀ DRY-RUN: nessuna scrittura');

const startTime = Date.now();
let processedThisRun = 0;

while (processedThisRun < LIMIT) {
    const rows = await withRetry(() => fetchBatch(cp.lastId), 'Lettura chunk da Supabase');
    if (rows.length === 0) break;

    // Chunk senza contenuto: salta (l'API embedding rifiuta testo vuoto)
    const valid = rows.filter(r => r.content && r.content.trim().length > 0);
    const skipped = rows.length - valid.length;
    if (skipped > 0) console.warn(`\n   ⚠️ ${skipped} chunk senza contenuto saltati`);

    if (valid.length > 0 && !DRY_RUN) {
        const vectors = await withRetry(() => embedBatch(valid.map(r => r.content)), 'Embedding batch (Gemini)');
        await withRetry(() => patchAll(valid, vectors), 'Scrittura embedding (Supabase)');
    }

    cp.lastId = rows[rows.length - 1].id;
    cp.processed += rows.length;
    processedThisRun += rows.length;
    if (!DRY_RUN) saveCheckpoint(cp);

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processedThisRun / elapsed;
    const remaining = total - cp.processed;
    const eta = rate > 0 ? Math.round(remaining / rate / 60) : '?';
    process.stdout.write(`\r   📐 ${cp.processed}/${total} (${(cp.processed / total * 100).toFixed(1)}%) — ETA ~${eta} min   `);

    await sleep(SLEEP_MS);
}

console.log(`\n\n✅ Fatto. Processati in questa run: ${processedThisRun} (totale checkpoint: ${cp.processed}/${total})`);
if (cp.processed >= total && !DRY_RUN) {
    console.log(`\n🎯 CORPUS COMPLETO. Prossimo passo:`);
    console.log(`   Vercel → Settings → Environment Variables → RAG_QUERY_TASK_TYPE=RETRIEVAL_QUERY`);
    console.log(`   poi redeploy. Le query diventeranno RETRIEVAL_QUERY, accoppiate al corpus.`);
}
