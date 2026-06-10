/* Test di api/stripe-webhook.js: il percorso che promuove (e retrocede) il tier Pro.
   - Le firme Stripe sono HMAC SHA256 REALI generate con node:crypto → testano
     la verifica di firma vera, non un mock.
   - Supabase è intercettato mockando fetch globale (supabase-js usa fetch):
     PATCH → 204, GET → 200 con JSON. Nessuna rete. */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

// Env PRIMA dell'import: il modulo istanzia Stripe e Supabase a livello top
const WEBHOOK_SECRET = 'whsec_test_secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-role-test-key';

const { default: handler } = await import('../../api/stripe-webhook.js');

function signPayload(payload, secret = WEBHOOK_SECRET) {
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
    return `t=${t},v1=${sig}`;
}

function makeReq(payload, sigHeader, method = 'POST') {
    const req = Readable.from([Buffer.from(payload)]);
    req.method = method;
    req.headers = { 'stripe-signature': sigHeader };
    return req;
}

function makeRes() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(obj) { this.body = obj; return this; },
        send(x) { this.body = x; return this; },
        end(x) { this.body = x; return this; }
    };
}

// Intercetta le chiamate PostgREST di supabase-js e le registra
function mockSupabaseFetch(t, { selectResult = [] } = {}) {
    const calls = [];
    const m = mock.method(globalThis, 'fetch', async (url, opts = {}) => {
        const method = opts.method || 'GET';
        calls.push({ url: String(url), method, body: opts.body ? String(opts.body) : null });
        if (method === 'PATCH') {
            return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify(selectResult), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    });
    t.after(() => m.mock.restore());
    return calls;
}

const checkoutEvent = (type, sessionOverrides = {}) => JSON.stringify({
    id: 'evt_test_1',
    type,
    data: {
        object: {
            id: 'cs_test_1',
            client_reference_id: 'user-123',
            customer: 'cus_test_1',
            payment_status: 'paid',
            ...sessionOverrides
        }
    }
});

test('metodo GET → 405', async () => {
    const res = makeRes();
    await handler(makeReq('{}', 'sig-irrilevante', 'GET'), res);
    assert.equal(res.statusCode, 405);
});

test('STRIPE_WEBHOOK_SECRET mancante → 500', async (t) => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    t.after(() => { process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET; });
    const res = makeRes();
    await handler(makeReq('{}', 'qualsiasi'), res);
    assert.equal(res.statusCode, 500);
});

test('firma non valida (secret sbagliato) → 400, nessuna chiamata al DB', async (t) => {
    const calls = mockSupabaseFetch(t);
    const payload = checkoutEvent('checkout.session.completed');
    const res = makeRes();
    await handler(makeReq(payload, signPayload(payload, 'whsec_attaccante')), res);
    assert.equal(res.statusCode, 400);
    assert.equal(calls.length, 0);
});

test('payload manomesso dopo la firma → 400', async (t) => {
    const calls = mockSupabaseFetch(t);
    const payload = checkoutEvent('checkout.session.completed');
    const sig = signPayload(payload);
    const tampered = payload.replace('user-123', 'user-MALEVOLO');
    const res = makeRes();
    await handler(makeReq(tampered, sig), res);
    assert.equal(res.statusCode, 400);
    assert.equal(calls.length, 0);
});

test('checkout completed ma payment_status unpaid (SEPA/bonifico) → 200 SENZA promozione a Pro', async (t) => {
    const calls = mockSupabaseFetch(t);
    const payload = checkoutEvent('checkout.session.completed', { payment_status: 'unpaid' });
    const res = makeRes();
    await handler(makeReq(payload, signPayload(payload)), res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 0, 'nessun update al profilo finché non è pagato');
});

test('checkout completed + paid → utente promosso a Pro', async (t) => {
    const calls = mockSupabaseFetch(t);
    const payload = checkoutEvent('checkout.session.completed');
    const res = makeRes();
    await handler(makeReq(payload, signPayload(payload)), res);
    assert.equal(res.statusCode, 200);

    const patch = calls.find(c => c.method === 'PATCH');
    assert.ok(patch, 'attesa una PATCH al profilo');
    assert.ok(patch.url.includes('/rest/v1/profiles'));
    assert.ok(patch.url.includes('id=eq.user-123'));
    const body = JSON.parse(patch.body);
    assert.equal(body.tier, 'Pro');
    assert.equal(body.stripe_customer_id, 'cus_test_1');
});

test('async_payment_succeeded (pagamento asincrono confermato) → promozione a Pro', async (t) => {
    const calls = mockSupabaseFetch(t);
    const payload = checkoutEvent('checkout.session.async_payment_succeeded');
    const res = makeRes();
    await handler(makeReq(payload, signPayload(payload)), res);
    assert.equal(res.statusCode, 200);
    const patch = calls.find(c => c.method === 'PATCH');
    assert.ok(patch, 'la conferma asincrona deve promuovere l\'utente');
    assert.equal(JSON.parse(patch.body).tier, 'Pro');
});

test('checkout paid ma senza client_reference_id → 200 senza update (nessun utente da associare)', async (t) => {
    const calls = mockSupabaseFetch(t);
    const payload = checkoutEvent('checkout.session.completed', { client_reference_id: null });
    const res = makeRes();
    await handler(makeReq(payload, signPayload(payload)), res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.filter(c => c.method === 'PATCH').length, 0);
});

test('subscription cancellata → downgrade a Free dell\'utente giusto', async (t) => {
    const calls = mockSupabaseFetch(t, { selectResult: [{ id: 'user-9' }] });
    const payload = JSON.stringify({
        id: 'evt_test_2',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_1', customer: 'cus_test_1' } }
    });
    const res = makeRes();
    await handler(makeReq(payload, signPayload(payload)), res);
    assert.equal(res.statusCode, 200);

    const get = calls.find(c => c.method === 'GET');
    assert.ok(get && get.url.includes('stripe_customer_id=eq.cus_test_1'), 'lookup per stripe_customer_id');
    const patch = calls.find(c => c.method === 'PATCH');
    assert.ok(patch && patch.url.includes('id=eq.user-9'));
    assert.equal(JSON.parse(patch.body).tier, 'Free');
});

test('evento non gestito (invoice.paid) → 200 received, nessuna chiamata al DB', async (t) => {
    const calls = mockSupabaseFetch(t);
    const payload = JSON.stringify({ id: 'evt_x', type: 'invoice.paid', data: { object: {} } });
    const res = makeRes();
    await handler(makeReq(payload, signPayload(payload)), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { received: true });
    assert.equal(calls.length, 0);
});
