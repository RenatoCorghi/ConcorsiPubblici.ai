/* Test del re-ranker LLM (rerankCandidates in api/proxy.js): ordinamento per
   voto di pertinenza, scarto degli irrilevanti, e soprattutto i fallback —
   se Gemini fallisce o risponde a metà, il RAG deve tenere l'ordine boostato. */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Ambiente pulito prima dell'import (come negli altri test del proxy)
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.VERCEL_ENV;
delete process.env.NODE_ENV;

const { rerankCandidates } = await import('../../api/proxy.js');

const candidates = [
    { tipo: 'sentenza_ssuu', titolo: 'SSUU 1234/2024', content: 'La simulazione del contratto...', boostedScore: 0.90 },
    { tipo: 'codice', titolo: 'Art. 1414 c.c.', content: 'Il contratto simulato non produce effetto...', boostedScore: 0.85 },
    { tipo: 'sentenza_sez_semplici', titolo: 'Cass. 999/2020', content: 'In tema di usucapione...', boostedScore: 0.80 }
];

function geminiResponse(votes) {
    return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(votes) }] } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('riordina per voto LLM e scarta gli irrilevanti (voto <= 2)', async (t) => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
        // Il terzo (usucapione, fuori tema) prende 1 → scartato; il codice batte le SSUU
        geminiResponse([{ i: 1, s: 7 }, { i: 2, s: 9 }, { i: 3, s: 1 }])
    );
    t.after(() => fetchMock.mock.restore());

    const result = await rerankCandidates('contratto simulato art 1414', candidates, 'test-key');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2, 'il candidato irrilevante deve sparire');
    assert.equal(result[0].titolo, 'Art. 1414 c.c.');
    assert.equal(result[1].titolo, 'SSUU 1234/2024');
});

test('a parità di voto vince il boostedScore', async (t) => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
        geminiResponse([{ i: 1, s: 8 }, { i: 2, s: 8 }, { i: 3, s: 8 }])
    );
    t.after(() => fetchMock.mock.restore());

    const result = await rerankCandidates('query', candidates, 'test-key');
    assert.deepEqual(result.map(m => m.titolo), ['SSUU 1234/2024', 'Art. 1414 c.c.', 'Cass. 999/2020']);
});

test('chiamata Gemini fallita → null (il chiamante tiene l\'ordine boostato)', async (t) => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
        throw new Error('network down');
    });
    t.after(() => fetchMock.mock.restore());

    const result = await rerankCandidates('query', candidates, 'test-key');
    assert.equal(result, null);
});

test('risposta troppo parziale (vota meno della metà) → null', async (t) => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
        geminiResponse([{ i: 1, s: 9 }]) // 1 voto su 3
    );
    t.after(() => fetchMock.mock.restore());

    const result = await rerankCandidates('query', candidates, 'test-key');
    assert.equal(result, null);
});

test('risposta non-JSON → null senza eccezioni', async (t) => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
        new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'mi dispiace, non posso' }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    t.after(() => fetchMock.mock.restore());

    const result = await rerankCandidates('query', candidates, 'test-key');
    assert.equal(result, null);
});

test('tutti i candidati sotto soglia → null (meglio l\'ordine boostato che zero fonti)', async (t) => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
        geminiResponse([{ i: 1, s: 0 }, { i: 2, s: 1 }, { i: 3, s: 2 }])
    );
    t.after(() => fetchMock.mock.restore());

    const result = await rerankCandidates('query', candidates, 'test-key');
    assert.equal(result, null);
});
