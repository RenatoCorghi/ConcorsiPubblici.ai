/* Test delle difese anti-abuso di api/proxy.js: sanitizzazione payload,
   whitelist modelli, rate limiter in-memory, normalizzazione materie.
   I limiti numerici sono asseriti come "specifica": se cambiano in proxy.js,
   questi test devono essere aggiornati consapevolmente. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    sanitizePayload,
    MODEL_WHITELIST,
    isRateLimited,
    normalizeMateria,
    materiaMatches
} from '../../api/proxy.js';

const validBody = (extra = {}) => ({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'ciao' }],
    ...extra
});

// --- sanitizePayload ---

test('payload minimo valido passa', () => {
    const r = sanitizePayload(validBody());
    assert.equal(r.valid, true);
    assert.equal(r.payload.model, 'gpt-4o-mini');
});

test('modello mancante o non stringa → rifiutato', () => {
    assert.equal(sanitizePayload({ messages: [{ role: 'user', content: 'x' }] }).valid, false);
    assert.equal(sanitizePayload(validBody({ model: 42 })).valid, false);
});

test('messages mancante o vuoto → rifiutato', () => {
    assert.equal(sanitizePayload({ model: 'gpt-4o-mini' }).valid, false);
    assert.equal(sanitizePayload(validBody({ messages: [] })).valid, false);
    assert.equal(sanitizePayload(validBody({ messages: 'non-array' })).valid, false);
});

test('messaggio senza role o content → rifiutato', () => {
    assert.equal(sanitizePayload(validBody({ messages: [{ content: 'x' }] })).valid, false);
    assert.equal(sanitizePayload(validBody({ messages: [{ role: 'user' }] })).valid, false);
});

test('più di 100 messaggi → rifiutato', () => {
    const messages = Array.from({ length: 101 }, () => ({ role: 'user', content: 'x' }));
    assert.equal(sanitizePayload(validBody({ messages })).valid, false);
});

test('singolo messaggio user oltre 150k chars → rifiutato', () => {
    const messages = [{ role: 'user', content: 'x'.repeat(150001) }];
    assert.equal(sanitizePayload(validBody({ messages })).valid, false);
});

test('system prompt lungo esente dal limite per-messaggio', () => {
    const messages = [
        { role: 'system', content: 's'.repeat(200000) },
        { role: 'user', content: 'ciao' }
    ];
    assert.equal(sanitizePayload(validBody({ messages })).valid, true);
});

test('cost bomb: payload complessivo oltre 400k chars → rifiutato', () => {
    // 3 messaggi da 150k ciascuno: singolarmente sotto il limite, ma 450k totali
    const messages = Array.from({ length: 3 }, () => ({ role: 'user', content: 'x'.repeat(150000) }));
    const r = sanitizePayload(validBody({ messages }));
    assert.equal(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('complessivo')));
});

test('temperature clampata in [0, 2] con default 0.5', () => {
    assert.equal(sanitizePayload(validBody({ temperature: -1 })).payload.temperature, 0);
    assert.equal(sanitizePayload(validBody({ temperature: 5 })).payload.temperature, 2);
    assert.equal(sanitizePayload(validBody({ temperature: 0.7 })).payload.temperature, 0.7);
    assert.equal(sanitizePayload(validBody()).payload.temperature, 0.5);
    assert.equal(sanitizePayload(validBody({ temperature: '2' })).payload.temperature, 0.5); // non numerica → default
});

test('max_tokens cappato a 8000 con default 8000', () => {
    assert.equal(sanitizePayload(validBody({ max_tokens: 99999 })).payload.max_tokens, 8000);
    assert.equal(sanitizePayload(validBody({ max_tokens: 500 })).payload.max_tokens, 500);
    assert.equal(sanitizePayload(validBody()).payload.max_tokens, 8000);
});

test('response_format: passa solo json_object', () => {
    const ok = sanitizePayload(validBody({ response_format: { type: 'json_object' } }));
    assert.deepEqual(ok.payload.response_format, { type: 'json_object' });
    const ko = sanitizePayload(validBody({ response_format: { type: 'arbitrario' } }));
    assert.equal(ko.payload.response_format, undefined);
});

test('campi arbitrari (stream, tools, api_key) rimossi dal payload pulito', () => {
    const r = sanitizePayload(validBody({ stream: true, tools: [{ type: 'function' }], api_key: 'rubata' }));
    assert.equal(r.valid, true);
    assert.equal('stream' in r.payload, false);
    assert.equal('tools' in r.payload, false);
    assert.equal('api_key' in r.payload, false);
});

test('content non-stringa coercito a stringa', () => {
    const r = sanitizePayload(validBody({ messages: [{ role: 'user', content: 123 }] }));
    assert.equal(r.valid, true);
    assert.equal(r.payload.messages[0].content, '123');
});

// --- MODEL_WHITELIST ---

test('whitelist: claude-haiku-4 (modello inesistente) assente', () => {
    assert.equal(MODEL_WHITELIST.anthropic.includes('claude-haiku-4'), false);
});

test('whitelist: i modelli usati dal frontend sono presenti', () => {
    assert.ok(MODEL_WHITELIST.anthropic.includes('claude-opus-4-8'));
    assert.ok(MODEL_WHITELIST.anthropic.includes('claude-sonnet-4-6'));
    assert.ok(MODEL_WHITELIST.google.includes('gemini-3-flash-preview'));
    assert.ok(MODEL_WHITELIST.openai.includes('gpt-4o-mini'));
});

// --- Rate limiter in-memory (fallback) ---

test('rate limiter: 60 richieste passano, la 61ª è bloccata', () => {
    const ip = 'test-ip-limite';
    let last;
    for (let i = 0; i < 60; i++) last = isRateLimited(ip);
    assert.equal(last.limited, false);
    assert.equal(last.remaining, 0);

    const blocked = isRateLimited(ip);
    assert.equal(blocked.limited, true);
    assert.ok(blocked.retryAfter >= 0 && blocked.retryAfter <= 60, `retryAfter fuori range: ${blocked.retryAfter}`);
});

test('rate limiter: IP diversi hanno contatori indipendenti', () => {
    for (let i = 0; i < 61; i++) isRateLimited('test-ip-a');
    const other = isRateLimited('test-ip-b');
    assert.equal(other.limited, false);
});

// --- Normalizzazione materie (filtro RAG) ---

test('normalizeMateria: varianti mappate al formato canonico', () => {
    assert.equal(normalizeMateria('procedura penale'), 'Diritto Processuale Penale');
    assert.equal(normalizeMateria('Processuale Civile'), 'Diritto Processuale Civile');
    assert.equal(normalizeMateria('amministrativo'), 'Diritto Amministrativo');
    assert.equal(normalizeMateria('penale'), 'Diritto Penale');
    assert.equal(normalizeMateria('Tutte le materie'), null);
    assert.equal(normalizeMateria(null), null);
});

test('materiaMatches: match per famiglia e blocco cross-branch', () => {
    assert.equal(materiaMatches('Giurisprudenza Civile', 'Diritto Civile'), true);
    assert.equal(materiaMatches('Diritto Processuale Civile', 'Diritto Civile'), true);
    assert.equal(materiaMatches('Diritto Penale', 'Diritto Civile'), false);
    assert.equal(materiaMatches(null, 'Diritto Civile'), true);   // chunk senza materia → passa
    assert.equal(materiaMatches('Diritto Penale', null), true);    // nessun filtro → passa
});
