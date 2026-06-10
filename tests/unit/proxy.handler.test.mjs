/* Test end-to-end del handler di api/proxy.js con req/res finti e fetch mockato.
   Coprono l'ordine delle difese: CORS → metodo → rate limit → validazione →
   whitelist modelli → feature obbligatoria → chiamata provider e normalizzazione. */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Ambiente pulito PRIMA dell'import del handler:
// - niente Upstash → rate limiter in-memory (nessuna rete)
// - niente VERCEL_ENV/NODE_ENV production → isLocalDev true (metering saltato: qui
//   testiamo il resto del perimetro; il metering ha test dedicati con client iniettato)
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.VERCEL_ENV;
delete process.env.NODE_ENV;
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-dummy';
process.env.OPENAI_API_KEY = 'sk-test-dummy';

const { default: handler } = await import('../../api/proxy.js');

let ipCounter = 0;
function makeReq({ method = 'POST', origin = 'https://concorsipubblici.ai', body = {}, ip } = {}) {
    const clientIp = ip || `10.0.0.${++ipCounter}`; // IP unico per non sporcare il rate limiter
    return {
        method,
        headers: { origin, 'x-forwarded-for': clientIp },
        body,
        socket: { remoteAddress: clientIp }
    };
}

function makeRes() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        ended: false,
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(obj) { this.body = obj; return this; },
        end() { this.ended = true; return this; }
    };
}

const guestBody = (extra = {}) => ({
    provider: 'anthropic',
    feature: 'aiCalls',
    model: 'claude-sonnet-4-6',
    messages: [
        { role: 'system', content: 'Sei un tutor di diritto.' },
        { role: 'user', content: 'Spiegami la legittima difesa.' }
    ],
    ...extra
});

test('OPTIONS (preflight) → 200', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'OPTIONS' }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.ended, true);
});

test('GET → 405 Method Not Allowed', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    assert.equal(res.statusCode, 405);
});

test('origin non autorizzata → 403 e header CORS di fallback (non riflette l\'origin ostile)', async () => {
    const res = makeRes();
    await handler(makeReq({ origin: 'https://evil.example.com', body: guestBody() }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://concorsipubblici.ai');
});

test('payload non valido (modello mancante) → 400 con dettagli', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { provider: 'openai', feature: 'aiCalls', messages: [{ role: 'user', content: 'x' }] } }), res);
    assert.equal(res.statusCode, 400);
    assert.ok(Array.isArray(res.body.details));
});

test('modello fuori whitelist → 400', async () => {
    const res = makeRes();
    await handler(makeReq({ body: guestBody({ model: 'claude-fantasioso-9' }) }), res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.error.includes('non consentito'));
});

test('feature mancante → 400 (anti-abuso)', async () => {
    const res = makeRes();
    const body = guestBody();
    delete body.feature;
    await handler(makeReq({ body }), res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.error.includes('feature'));
});

test('rate limit: la 61ª richiesta dallo stesso IP → 429 con Retry-After', async () => {
    const ip = '203.0.113.99';
    // Richieste economiche: falliscono alla validazione (400), ma passano dal rate limiter
    const cheapBody = { provider: 'openai', feature: 'aiCalls', messages: [] };
    let res;
    for (let i = 0; i < 60; i++) {
        res = makeRes();
        await handler(makeReq({ body: cheapBody, ip }), res);
        assert.equal(res.statusCode, 400, `richiesta ${i + 1} doveva passare il rate limiter`);
    }
    res = makeRes();
    await handler(makeReq({ body: cheapBody, ip }), res);
    assert.equal(res.statusCode, 429);
    assert.ok(res.headers['Retry-After'] !== undefined);
});

test('happy path Anthropic: payload trasformato e risposta normalizzata in formato OpenAI', async (t) => {
    const captured = [];
    const fetchMock = mock.method(globalThis, 'fetch', async (url, opts) => {
        captured.push({ url: String(url), opts });
        return new Response(JSON.stringify({
            content: [{ type: 'text', text: 'La legittima difesa ex art. 52 c.p. ...' }],
            usage: { input_tokens: 100, output_tokens: 50 }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    t.after(() => fetchMock.mock.restore());

    const res = makeRes();
    await handler(makeReq({ body: guestBody({ temperature: 2, max_tokens: 99999 }) }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, 'https://api.anthropic.com/v1/messages');
    assert.equal(captured[0].opts.headers['x-api-key'], 'sk-ant-test-dummy');

    const sent = JSON.parse(captured[0].opts.body);
    assert.equal(sent.model, 'claude-sonnet-4-6');
    assert.equal(sent.temperature, 1, 'temperature deve essere clampata a 1.0 per Anthropic');
    assert.equal(sent.max_tokens, 8000, 'max_tokens deve essere cappato a 8000');
    assert.equal(sent.system[0].cache_control.type, 'ephemeral', 'prompt caching attivo sul system');
    assert.equal(sent.messages.every(m => m.role !== 'system'), true, 'nessun system tra i messages Anthropic');
    const lastSent = sent.messages[sent.messages.length - 1];
    assert.equal(Array.isArray(lastSent.content), true, 'ultimo messaggio in forma blocco');
    assert.equal(lastSent.content[0].cache_control.type, 'ephemeral', 'breakpoint cache sulla storia conversazionale');

    // Risposta normalizzata in formato OpenAI
    assert.equal(res.body.choices[0].message.content, 'La legittima difesa ex art. 52 c.p. ...');
    assert.equal(res.body.usage.total_tokens, 150);
});

test('happy path OpenAI: passthrough del payload sanitizzato', async (t) => {
    const captured = [];
    const fetchMock = mock.method(globalThis, 'fetch', async (url, opts) => {
        captured.push({ url: String(url), opts });
        return new Response(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'ok' } }],
            usage: { total_tokens: 42 }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    t.after(() => fetchMock.mock.restore());

    const res = makeRes();
    await handler(makeReq({
        body: { provider: 'openai', feature: 'aiCalls', model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ciao' }], stream: true }
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(captured[0].url, 'https://api.openai.com/v1/chat/completions');
    const sent = JSON.parse(captured[0].opts.body);
    assert.equal('stream' in sent, false, 'i campi non whitelistati non devono arrivare al provider');
    assert.equal(res.body.choices[0].message.content, 'ok');
});

test('errore del provider → status inoltrato (4xx) o 502 (5xx), senza leak della key', async (t) => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
        new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 529 })
    );
    t.after(() => fetchMock.mock.restore());

    const res = makeRes();
    await handler(makeReq({ body: guestBody() }), res);
    assert.equal(res.statusCode, 502);
    assert.ok(!JSON.stringify(res.body).includes('sk-ant-test-dummy'));
});

test('Anthropic: due messaggi system → due blocchi cache separati (prompt statico + RAG)', async (t) => {
    const captured = [];
    const fetchMock = mock.method(globalThis, 'fetch', async (url, opts) => {
        captured.push({ url: String(url), opts });
        return new Response(JSON.stringify({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    t.after(() => fetchMock.mock.restore());

    const res = makeRes();
    await handler(makeReq({
        body: {
            provider: 'anthropic', feature: 'aiCalls', model: 'claude-sonnet-4-6',
            messages: [
                { role: 'system', content: 'PROMPT STATICO' },
                { role: 'system', content: 'CONTESTO RAG DEL MODULO' },
                { role: 'user', content: 'ciao' }
            ]
        }
    }), res);

    assert.equal(res.statusCode, 200);
    const sent = JSON.parse(captured[0].opts.body);
    assert.equal(sent.system.length, 2, 'un blocco per ogni messaggio system');
    assert.equal(sent.system[0].text, 'PROMPT STATICO');
    assert.equal(sent.system[1].text, 'CONTESTO RAG DEL MODULO');
    assert.ok(sent.system.every(b => b.cache_control?.type === 'ephemeral'), 'breakpoint cache su ogni blocco');
});

test('verifyCitation: usa FTS sul GIN, nessuna chiamata embedding', async (t) => {
    process.env.SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-test';
    const captured = [];
    const fetchMock = mock.method(globalThis, 'fetch', async (url) => {
        captured.push(String(url));
        return new Response(JSON.stringify([
            { id: 1, document_id: 9, content: 'La Cassazione n. 35823/2023 ha affermato il litisconsorzio necessario.' }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    t.after(() => fetchMock.mock.restore());

    const res = makeRes();
    await handler(makeReq({ body: { feature: 'verifyCitation', citationNumber: '35823/2023' } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.found, true);
    assert.ok(res.body.count >= 1);
    assert.ok(captured.every(u => !u.includes('generativelanguage')), 'nessuna chiamata embedding');
    assert.ok(captured.some(u => u.includes('/rest/v1/rag_chunks') && u.includes('fts=')), 'query FTS su rag_chunks');
});

test('verifyCitation: numero assente dal corpus → found false', async (t) => {
    process.env.SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-test';
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    t.after(() => fetchMock.mock.restore());

    const res = makeRes();
    await handler(makeReq({ body: { feature: 'verifyCitation', citationNumber: '99999/2024' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.found, false);
});
