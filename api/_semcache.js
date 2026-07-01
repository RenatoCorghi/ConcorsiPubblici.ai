/* ============================================================
   _SEMCACHE.JS — Cache semantica a due livelli per il retrieval RAG
   (il prefisso "_" evita che Vercel esponga il file come endpoint,
   stessa convenzione di _cors.js)

   L1 (esatto): chiave sha256(queryText normalizzato + materia + flag)
       → hit PRIMA di qualsiasi chiamata: niente expansion, niente
       embedding, niente ricerca, niente re-rank. ~1 roundtrip Redis.
   L2 (semantico): firma LSH a iperpiani casuali (72 bit, 6 bande da 12)
       calcolata sull'embedding della query → candidati per banda →
       verifica coseno >= soglia (default 0.97) contro l'embedding
       memorizzato nell'entry. Riusa retrieval di query FORMULATE
       DIVERSAMENTE ma semanticamente equivalenti. Costa il solo
       embedding della query grezza.

   INVALIDAZIONE A VETTORI DI VERSIONE (migration 014): ogni entry salva
   la versione delle famiglie di corpus da cui dipende
   (rag_family_stats.version, bumpata dal trigger di ingestione). Al
   lookup si confronta con le versioni correnti, memoizzate in-instance
   per 60s: se il corpus della famiglia è cambiato l'entry è stantia →
   miss + DEL pigra. Staleness massima = 60s dopo una ingestione,
   invalidazione esatta per partizione, zero flush globali o scansioni.
   Se il servizio versioni non è raggiungibile si degrada al solo TTL.

   STORAGE: Upstash Redis via REST (condiviso tra le istanze serverless,
   stesse env del rate limiter: UPSTASH_REDIS_REST_URL/TOKEN); fallback
   in-memory per sviluppo locale e test. Payload compresso gzip+base64.
   OGNI errore degrada in silenzio a "miss": la cache non deve MAI
   rompere il RAG.
   ============================================================ */
import crypto from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';

// Bump per invalidare l'intera cache dopo cambi di logica retrieval
const CACHE_SCHEMA_VERSION = 1;
const ENTRY_TTL_SECS = 24 * 3600;      // vita massima di un'entry
const BAND_TTL_SECS = 25 * 3600;       // le bande vivono poco più delle entry
const VERSION_MEMO_MS = 60 * 1000;     // memo in-instance del vettore versioni
const REDIS_TIMEOUT_MS = 1500;         // la cache è veloce o si toglie di mezzo
const LSH_BITS = 72;                   // 6 bande da 12 bit
const LSH_BANDS = 6;
const LSH_BAND_BITS = LSH_BITS / LSH_BANDS;
const MAX_L2_CANDIDATES = 8;           // cap sulle entry verificate per lookup
const MAX_PAYLOAD_BYTES = 200 * 1024;  // oltre, non cachare (entry anomala)
const EMBED_DIMS = 768;

const minSim = () => {
    const v = parseFloat(process.env.RAG_SEMCACHE_MIN_SIM || '0.97');
    return Number.isFinite(v) ? v : 0.97;
};

// --- IPERPIANI LSH DETERMINISTICI ---
// PRNG seedato (mulberry32) + Box-Muller → iperpiani gaussiani identici su
// ogni istanza serverless: le firme sono confrontabili tra istanze e deploy.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const PLANES = (() => {
    const rnd = mulberry32(0xC04C0451); // seed fisso: NON cambiarlo (invalida le firme)
    const p = new Float32Array(LSH_BITS * EMBED_DIMS);
    for (let i = 0; i < p.length; i += 2) {
        // Box-Muller: coppie gaussiane da coppie uniformi
        const u1 = Math.max(rnd(), 1e-12);
        const u2 = rnd();
        const r = Math.sqrt(-2 * Math.log(u1));
        p[i] = r * Math.cos(2 * Math.PI * u2);
        if (i + 1 < p.length) p[i + 1] = r * Math.sin(2 * Math.PI * u2);
    }
    return p;
})();

// Firma LSH → array di LSH_BANDS stringhe esadecimali (una per banda)
export function lshBands(vector) {
    const bits = [];
    for (let h = 0; h < LSH_BITS; h++) {
        let dot = 0;
        const base = h * EMBED_DIMS;
        for (let d = 0; d < EMBED_DIMS; d++) dot += PLANES[base + d] * vector[d];
        bits.push(dot >= 0 ? 1 : 0);
    }
    const bands = [];
    for (let b = 0; b < LSH_BANDS; b++) {
        let val = 0;
        for (let i = 0; i < LSH_BAND_BITS; i++) {
            val = (val << 1) | bits[b * LSH_BAND_BITS + i];
        }
        bands.push(val.toString(16).padStart(Math.ceil(LSH_BAND_BITS / 4), '0'));
    }
    return bands;
}

export function cosineSim(a, b) {
    if (!a || !b || a.length !== b.length) return -1;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const den = Math.sqrt(na) * Math.sqrt(nb);
    return den > 0 ? dot / den : -1;
}

// --- CHIAVI ---
const normQuery = (q) => String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
const materiaKey = (materia) => (materia || '__none__').toLowerCase().replace(/\s+/g, '_');

export function cacheKeyL1(queryText, materia, skipExpansion) {
    const raw = `${normQuery(queryText)}|${materiaKey(materia)}|${skipExpansion ? 1 : 0}`;
    return `ragc:e:${CACHE_SCHEMA_VERSION}:${crypto.createHash('sha256').update(raw).digest('hex')}`;
}

const bandKey = (materia, i, hex) => `ragc:b:${CACHE_SCHEMA_VERSION}:${materiaKey(materia)}:${i}:${hex}`;

// --- BACKEND: Upstash pipeline o emulazione in-memory ---
const hasUpstash = () =>
    !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

// Emulazione locale del sottoinsieme di comandi usato (dev/test, per-istanza)
const memKV = new Map();   // key → { v, exp }
const memSets = new Map(); // key → { members: Map<member, true>, exp }

function memCleanup() {
    if (memKV.size + memSets.size < 5000) return;
    const now = Date.now();
    for (const [k, e] of memKV) if (e.exp && e.exp < now) memKV.delete(k);
    for (const [k, e] of memSets) if (e.exp && e.exp < now) memSets.delete(k);
}

function execMemoryCmd(cmd) {
    const now = Date.now();
    const [op, key, ...rest] = cmd;
    const alive = (e) => e && (!e.exp || e.exp >= now);
    switch (op) {
        case 'GET': {
            const e = memKV.get(key);
            return alive(e) ? e.v : null;
        }
        case 'SET': { // SET key val EX secs
            const exIdx = rest.indexOf('EX');
            const exp = exIdx >= 0 ? now + parseInt(rest[exIdx + 1], 10) * 1000 : null;
            memKV.set(key, { v: rest[0], exp });
            memCleanup();
            return 'OK';
        }
        case 'MGET': {
            return [key, ...rest].map(k => {
                const e = memKV.get(k);
                return alive(e) ? e.v : null;
            });
        }
        case 'SADD': {
            let e = memSets.get(key);
            if (!alive(e)) { e = { members: new Map(), exp: null }; memSets.set(key, e); }
            rest.forEach(m => e.members.set(m, true));
            return rest.length;
        }
        case 'EXPIRE': {
            const kv = memKV.get(key), st = memSets.get(key);
            const exp = now + parseInt(rest[0], 10) * 1000;
            if (kv) kv.exp = exp;
            if (st) st.exp = exp;
            return (kv || st) ? 1 : 0;
        }
        case 'SMEMBERS': {
            const e = memSets.get(key);
            return alive(e) ? [...e.members.keys()] : [];
        }
        case 'DEL': {
            let n = 0;
            [key, ...rest].forEach(k => {
                if (memKV.delete(k)) n++;
                if (memSets.delete(k)) n++;
            });
            return n;
        }
        default:
            return null;
    }
}

async function backendPipeline(cmds) {
    if (!hasUpstash()) return cmds.map(execMemoryCmd);
    const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
            'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
        body: JSON.stringify(cmds)
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    const data = await res.json();
    return data.map(r => r?.result ?? null);
}

// --- VETTORE DI VERSIONI (rag_family_stats.version, migration 014) ---
let versionMemo = { at: 0, data: null };

async function fetchVersionsFromDB() {
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    if (!process.env.SUPABASE_URL || !supabaseKey) return null;
    const res = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/rag_family_stats?select=family,version`,
        {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
            signal: AbortSignal.timeout(REDIS_TIMEOUT_MS)
        }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    const map = {};
    rows.forEach(r => { map[r.family] = Number(r.version) || 0; });
    return map;
}

async function getCurrentVersions(versionsProvider) {
    if (versionsProvider) return versionsProvider();
    if (versionMemo.data && Date.now() - versionMemo.at < VERSION_MEMO_MS) return versionMemo.data;
    try {
        const data = await fetchVersionsFromDB();
        if (data) versionMemo = { at: Date.now(), data };
        return data;
    } catch {
        return null;
    }
}

// Famiglie di corpus da cui dipende una query: quella filtrata + i chunk
// senza materia (inclusi dal filtro SQL), oppure tutto il corpus.
const touchedFamilies = (family) => family ? [family, '__none__'] : ['__all__'];

function snapshotVersions(current, family) {
    const out = {};
    if (!current) return out;
    touchedFamilies(family).forEach(f => { out[f] = current[f] ?? 0; });
    return out;
}

// versions dell'entry == versioni correnti per TUTTE le famiglie toccate?
// current null (servizio versioni giù o migration non applicata) → ci si
// affida al TTL: meglio un'entry potenzialmente stantia di nessuna cache.
function versionsFresh(entryVersions, current, family) {
    if (!current) return true;
    if (!entryVersions) return false;
    return touchedFamilies(family).every(f => (entryVersions[f] ?? -1) === (current[f] ?? 0));
}

// --- SERIALIZZAZIONE ---
const packPayload = (payload) =>
    gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64');
const unpackPayload = (gz) =>
    JSON.parse(gunzipSync(Buffer.from(gz, 'base64')).toString('utf8'));
const packVector = (vec) =>
    Buffer.from(new Float32Array(vec).buffer).toString('base64');
const unpackVector = (b64) =>
    Array.from(new Float32Array(new Uint8Array(Buffer.from(b64, 'base64')).buffer));

function parseEntry(rawJson) {
    try {
        const env = JSON.parse(rawJson);
        if (!env || env.v !== CACHE_SCHEMA_VERSION || !env.gz) return null;
        return env;
    } catch {
        return null;
    }
}

// --- API PUBBLICA ---

/**
 * L1: lookup esatto per chiave. Nessun embedding richiesto.
 * @returns {Object|null} payload { contextText, sources } o null
 */
export async function semCacheGetL1(keyL1, { family = null, versionsProvider = null } = {}) {
    try {
        const [raw] = await backendPipeline([['GET', keyL1]]);
        if (!raw) return null;
        const entry = parseEntry(raw);
        if (!entry) return null;
        const current = await getCurrentVersions(versionsProvider);
        if (!versionsFresh(entry.versions, current, family)) {
            backendPipeline([['DEL', keyL1]]).catch(() => {});
            return null;
        }
        return unpackPayload(entry.gz);
    } catch (e) {
        console.warn(`[RAG-CACHE] L1 lookup fallito (ignoro): ${e.message}`);
        return null;
    }
}

/**
 * L2: lookup semantico via bande LSH + verifica coseno.
 * Richiede l'embedding della query (già nello spazio del corpus).
 * @returns {Object|null} payload { contextText, sources } o null
 */
export async function semCacheGetL2(vector, materia, { family = null, versionsProvider = null } = {}) {
    try {
        if (!vector || vector.length !== EMBED_DIMS) return null;
        const bands = lshBands(vector);
        const memberSets = await backendPipeline(
            bands.map((hex, i) => ['SMEMBERS', bandKey(materia, i, hex)])
        );
        const candidates = [...new Set(memberSets.flat().filter(Boolean))].slice(0, MAX_L2_CANDIDATES);
        if (candidates.length === 0) return null;

        const [rawEntries, current] = await Promise.all([
            backendPipeline([['MGET', ...candidates]]).then(r => r[0] || []),
            getCurrentVersions(versionsProvider)
        ]);

        let best = null, bestSim = -1;
        const staleKeys = [];
        const threshold = minSim();
        for (let i = 0; i < candidates.length; i++) {
            const entry = rawEntries[i] ? parseEntry(rawEntries[i]) : null;
            if (!entry || !entry.emb) continue;
            if (!versionsFresh(entry.versions, current, family)) {
                staleKeys.push(candidates[i]);
                continue;
            }
            const sim = cosineSim(vector, unpackVector(entry.emb));
            if (sim >= threshold && sim > bestSim) {
                bestSim = sim;
                best = entry;
            }
        }
        if (staleKeys.length > 0) backendPipeline([['DEL', ...staleKeys]]).catch(() => {});
        if (!best) return null;
        console.log(`[RAG-CACHE] L2: match semantico con similarità ${bestSim.toFixed(4)}`);
        return unpackPayload(best.gz);
    } catch (e) {
        console.warn(`[RAG-CACHE] L2 lookup fallito (ignoro): ${e.message}`);
        return null;
    }
}

/**
 * Scrive un'entry (chiave L1) e la registra nelle bande LSH (se c'è il
 * vettore). Fire-and-forget dal proxy: non va mai await-ata sul percorso
 * di risposta. Errori silenziosi.
 */
export async function semCacheStore(keyL1, vector, materia, payload, { family = null, versionsProvider = null } = {}) {
    try {
        const gz = packPayload(payload);
        if (gz.length > MAX_PAYLOAD_BYTES) {
            console.warn(`[RAG-CACHE] payload troppo grande (${gz.length}B compressi), non cacho`);
            return;
        }
        const current = await getCurrentVersions(versionsProvider);
        const entry = {
            v: CACHE_SCHEMA_VERSION,
            versions: snapshotVersions(current, family),
            gz
        };
        const cmds = [];
        if (vector && vector.length === EMBED_DIMS) {
            entry.emb = packVector(vector);
        }
        cmds.push(['SET', keyL1, JSON.stringify(entry), 'EX', String(ENTRY_TTL_SECS)]);
        if (entry.emb) {
            lshBands(vector).forEach((hex, i) => {
                const bk = bandKey(materia, i, hex);
                cmds.push(['SADD', bk, keyL1]);
                cmds.push(['EXPIRE', bk, String(BAND_TTL_SECS)]);
            });
        }
        await backendPipeline(cmds);
    } catch (e) {
        console.warn(`[RAG-CACHE] store fallito (ignoro): ${e.message}`);
    }
}

// Solo per i test: svuota il backend in-memory e la memo versioni
export function __resetForTests() {
    memKV.clear();
    memSets.clear();
    versionMemo = { at: 0, data: null };
}
