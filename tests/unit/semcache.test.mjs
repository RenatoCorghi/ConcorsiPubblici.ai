/* Test della cache semantica RAG (api/_semcache.js): determinismo LSH,
   chiavi L1, roundtrip store/lookup sul backend in-memory (in assenza di
   UPSTASH_* le funzioni usano l'emulazione locale), partizione per materia
   e invalidazione a vettori di versione. */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    lshBands,
    cosineSim,
    cacheKeyL1,
    semCacheGetL1,
    semCacheGetL2,
    semCacheStore,
    __resetForTests
} from '../../api/_semcache.js';

// PRNG deterministico per costruire vettori di test riproducibili
function seededVector(seed, dims = 768) {
    let a = seed >>> 0;
    const v = new Array(dims);
    for (let i = 0; i < dims; i++) {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        v[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
    }
    return v;
}

// Perturbazione piccola: coseno col vettore base ~0.999 (sopra la soglia 0.97)
function nearVector(base, scale = 0.02, seed = 42) {
    const noise = seededVector(seed);
    return base.map((x, i) => x + scale * noise[i]);
}

const BASE = seededVector(1234);
const NEAR = nearVector(BASE);
const FAR = seededVector(987654);

const PAYLOAD = {
    contextText: '<RAG_CONTEXT>contenuto di prova</RAG_CONTEXT>',
    sources: [{ titolo: 'Fonte Test', tipo: 'codice', similarity: 0.9, fullContent: 'testo completo della fonte' }],
    _meta: { topTipo: 'codice', topScore: 0.91 }
};

const FRESH_VERSIONS = { civile: 3, penale: 1, __none__: 2, __all__: 7 };
const freshProvider = () => ({ ...FRESH_VERSIONS });

beforeEach(() => __resetForTests());

// --- LSH ---

test('lshBands è deterministica: stesso vettore → stesse bande', () => {
    const a = lshBands(BASE);
    const b = lshBands(BASE);
    assert.deepEqual(a, b);
    assert.equal(a.length, 6);
    a.forEach(hex => assert.match(hex, /^[0-9a-f]{3}$/));
});

test('vettori quasi identici condividono almeno una banda LSH', () => {
    assert.ok(cosineSim(BASE, NEAR) > 0.97, 'precondizione: NEAR deve superare la soglia');
    const a = lshBands(BASE);
    const b = lshBands(NEAR);
    const shared = a.filter((hex, i) => b[i] === hex);
    assert.ok(shared.length >= 1, `attese bande condivise, trovate ${shared.length}`);
});

test('vettori indipendenti hanno coseno lontano dalla soglia', () => {
    const sim = cosineSim(BASE, FAR);
    assert.ok(Math.abs(sim) < 0.5, `coseno atteso ~0, trovato ${sim}`);
});

test('cosineSim: identico → 1, opposto → -1, dimensioni diverse → -1', () => {
    assert.ok(Math.abs(cosineSim(BASE, BASE) - 1) < 1e-9);
    assert.ok(Math.abs(cosineSim(BASE, BASE.map(x => -x)) + 1) < 1e-9);
    assert.equal(cosineSim(BASE, [1, 2, 3]), -1);
});

// --- Chiavi L1 ---

test('cacheKeyL1 normalizza maiuscole e spazi', () => {
    const a = cacheKeyL1('La   Legittima Difesa', 'Diritto Penale', true);
    const b = cacheKeyL1('la legittima difesa', 'Diritto Penale', true);
    assert.equal(a, b);
});

test('cacheKeyL1 distingue materia e skipExpansion', () => {
    const base = cacheKeyL1('legittima difesa', 'Diritto Penale', true);
    assert.notEqual(base, cacheKeyL1('legittima difesa', 'Diritto Civile', true));
    assert.notEqual(base, cacheKeyL1('legittima difesa', 'Diritto Penale', false));
    assert.notEqual(base, cacheKeyL1('legittima difesa', null, true));
});

// --- Roundtrip store/lookup (backend in-memory) ---

test('L1: store → get restituisce il payload intatto (fullContent incluso)', async () => {
    const key = cacheKeyL1('simulazione art 1414', 'Diritto Civile', true);
    await semCacheStore(key, BASE, 'Diritto Civile', PAYLOAD, { family: 'civile', versionsProvider: freshProvider });
    const hit = await semCacheGetL1(key, { family: 'civile', versionsProvider: freshProvider });
    assert.deepEqual(hit, PAYLOAD);
    assert.equal(hit.sources[0].fullContent, 'testo completo della fonte');
});

test('L1: chiave mai scritta → null', async () => {
    const miss = await semCacheGetL1(cacheKeyL1('query mai vista', null, false), { versionsProvider: freshProvider });
    assert.equal(miss, null);
});

test('L2: stesso vettore → hit; vettore vicino → hit; vettore lontano → null', async () => {
    const key = cacheKeyL1('simulazione art 1414', 'Diritto Civile', true);
    await semCacheStore(key, BASE, 'Diritto Civile', PAYLOAD, { family: 'civile', versionsProvider: freshProvider });

    const same = await semCacheGetL2(BASE, 'Diritto Civile', { family: 'civile', versionsProvider: freshProvider });
    assert.deepEqual(same, PAYLOAD);

    const near = await semCacheGetL2(NEAR, 'Diritto Civile', { family: 'civile', versionsProvider: freshProvider });
    assert.deepEqual(near, PAYLOAD, 'query semanticamente equivalente deve fare hit');

    const far = await semCacheGetL2(FAR, 'Diritto Civile', { family: 'civile', versionsProvider: freshProvider });
    assert.equal(far, null, 'vettore non correlato non deve fare hit');
});

test('L2: la partizione per materia è rigida (stesso vettore, materia diversa → null)', async () => {
    const key = cacheKeyL1('simulazione art 1414', 'Diritto Civile', true);
    await semCacheStore(key, BASE, 'Diritto Civile', PAYLOAD, { family: 'civile', versionsProvider: freshProvider });
    const cross = await semCacheGetL2(BASE, 'Diritto Penale', { family: 'penale', versionsProvider: freshProvider });
    assert.equal(cross, null);
});

test('entry senza vettore: L1 funziona, L2 non la trova', async () => {
    const key = cacheKeyL1('query senza embedding', null, false);
    await semCacheStore(key, null, null, PAYLOAD, { versionsProvider: freshProvider });
    assert.deepEqual(await semCacheGetL1(key, { versionsProvider: freshProvider }), PAYLOAD);
    assert.equal(await semCacheGetL2(BASE, null, { versionsProvider: freshProvider }), null);
});

// --- Invalidazione a vettori di versione ---

test('bump di versione della famiglia toccata → l\'entry diventa miss (L1 e L2)', async () => {
    const key = cacheKeyL1('simulazione art 1414', 'Diritto Civile', true);
    await semCacheStore(key, BASE, 'Diritto Civile', PAYLOAD, { family: 'civile', versionsProvider: freshProvider });

    const bumped = () => ({ ...FRESH_VERSIONS, civile: FRESH_VERSIONS.civile + 1 });
    assert.equal(await semCacheGetL1(key, { family: 'civile', versionsProvider: bumped }), null);
    assert.equal(await semCacheGetL2(BASE, 'Diritto Civile', { family: 'civile', versionsProvider: bumped }), null);
});

test('bump di una famiglia NON toccata → l\'entry resta valida', async () => {
    const key = cacheKeyL1('simulazione art 1414', 'Diritto Civile', true);
    await semCacheStore(key, BASE, 'Diritto Civile', PAYLOAD, { family: 'civile', versionsProvider: freshProvider });

    const bumpedOther = () => ({ ...FRESH_VERSIONS, penale: 99 });
    assert.deepEqual(await semCacheGetL1(key, { family: 'civile', versionsProvider: bumpedOther }), PAYLOAD);
});

test('query senza filtro materia dipende da __all__: bump di __all__ → miss', async () => {
    const key = cacheKeyL1('query globale', null, false);
    await semCacheStore(key, BASE, null, PAYLOAD, { family: null, versionsProvider: freshProvider });
    assert.deepEqual(await semCacheGetL1(key, { family: null, versionsProvider: freshProvider }), PAYLOAD);

    const bumpedAll = () => ({ ...FRESH_VERSIONS, __all__: 8 });
    assert.equal(await semCacheGetL1(key, { family: null, versionsProvider: bumpedAll }), null);
});

test('servizio versioni non disponibile → si degrada al TTL (hit consentito)', async () => {
    const key = cacheKeyL1('query con versioni giù', 'Diritto Civile', true);
    await semCacheStore(key, BASE, 'Diritto Civile', PAYLOAD, { family: 'civile', versionsProvider: freshProvider });
    const hit = await semCacheGetL1(key, { family: 'civile', versionsProvider: () => null });
    assert.deepEqual(hit, PAYLOAD);
});
