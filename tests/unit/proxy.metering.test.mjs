/* Test del metering server-side (applyMetering in api/proxy.js).
   Il client Supabase è un fake iniettato: nessuna rete, nessun DB.
   Questo è il percorso che decide chi consuma crediti e chi viene bloccato. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMetering, FREE_LIMITS } from '../../api/proxy.js';

// Fake minimale del client Supabase: riproduce le sole chiamate usate da applyMetering
function fakeSupabase({ user = { id: 'user-1' }, authError = null, tier = 'Free', usage = null } = {}) {
    const calls = { upserts: [] };
    return {
        calls,
        auth: {
            getUser: async () => authError
                ? { data: { user: null }, error: { message: authError } }
                : { data: { user }, error: null }
        },
        from(table) {
            const builder = {
                select() { return builder; },
                eq() { return builder; },
                async single() {
                    if (table === 'profiles') return { data: tier === null ? null : { tier }, error: null };
                    if (table === 'usage_metering') return { data: usage, error: usage ? null : { code: 'PGRST116' } };
                    return { data: null, error: null };
                },
                async upsert(payload, opts) {
                    calls.upserts.push({ table, payload, opts });
                    return { data: null, error: null };
                }
            };
            return builder;
        }
    };
}

const currentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

test('FREE_LIMITS: la specifica dei limiti Free non cambia per sbaglio', () => {
    assert.deepEqual(FREE_LIMITS, {
        aiCalls: 3, oralSessions: 0, tutorChats: 5, aiTraces: 0,
        pdfExports: 0, aiQuiz: 5, phantomTutor: 0, normeTooltip: 30
    });
});

test('token non valido → 401, nessun consumo', async () => {
    const sb = fakeSupabase({ authError: 'invalid JWT' });
    const r = await applyMetering(sb, 'token-scaduto', 'aiCalls');
    assert.deepEqual({ ok: r.ok, status: r.status }, { ok: false, status: 401 });
    assert.equal(sb.calls.upserts.length, 0);
});

test('utente Pro → passa senza consumare crediti', async () => {
    const sb = fakeSupabase({ tier: 'Pro' });
    const r = await applyMetering(sb, 'token', 'aiCalls');
    assert.equal(r.ok, true);
    assert.equal(r.tier, 'Pro');
    assert.equal(sb.calls.upserts.length, 0);
});

test('profilo mancante → trattato come Free (default sicuro)', async () => {
    const sb = fakeSupabase({ tier: null });
    const r = await applyMetering(sb, 'token', 'aiCalls');
    assert.equal(r.ok, true);
    assert.equal(r.tier, 'Free');
    assert.equal(sb.calls.upserts.length, 1); // ha consumato un credito Free
});

test('Free + feature sconosciuta → 400', async () => {
    const sb = fakeSupabase();
    const r = await applyMetering(sb, 'token', 'featureInventata');
    assert.deepEqual({ ok: r.ok, status: r.status }, { ok: false, status: 400 });
});

test('Free + feature con limite 0 (esclusiva Pro) → 403', async () => {
    for (const feature of ['oralSessions', 'aiTraces', 'pdfExports', 'phantomTutor']) {
        const sb = fakeSupabase();
        const r = await applyMetering(sb, 'token', feature);
        assert.deepEqual({ ok: r.ok, status: r.status }, { ok: false, status: 403 }, `feature: ${feature}`);
        assert.equal(sb.calls.upserts.length, 0, `feature: ${feature} non deve consumare`);
    }
});

test('Free + primo uso del mese → ok e upsert con contatore a 1', async () => {
    const sb = fakeSupabase({ usage: null }); // nessuna riga usage_metering
    const r = await applyMetering(sb, 'token', 'aiCalls');
    assert.equal(r.ok, true);
    assert.equal(sb.calls.upserts.length, 1);
    const up = sb.calls.upserts[0];
    assert.equal(up.payload.aiCalls, 1);
    assert.equal(up.payload.user_id, 'user-1');
    assert.equal(up.payload.month, currentMonth());
    assert.equal(up.opts.onConflict, 'user_id, month');
});

test('Free + uso sotto il limite → incrementa il contatore', async () => {
    const sb = fakeSupabase({ usage: { aiCalls: 2 } });
    const r = await applyMetering(sb, 'token', 'aiCalls');
    assert.equal(r.ok, true);
    assert.equal(sb.calls.upserts[0].payload.aiCalls, 3);
});

test('Free + crediti esauriti → 403 e NESSUN upsert', async () => {
    const sb = fakeSupabase({ usage: { aiCalls: 3 } }); // limite aiCalls = 3
    const r = await applyMetering(sb, 'token', 'aiCalls');
    assert.deepEqual({ ok: r.ok, status: r.status }, { ok: false, status: 403 });
    assert.equal(sb.calls.upserts.length, 0);
});

test('Free + contatore oltre il limite (dato sporco) → comunque 403', async () => {
    const sb = fakeSupabase({ usage: { aiCalls: 99 } });
    const r = await applyMetering(sb, 'token', 'aiCalls');
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
});

test('normeTooltip: 29/30 passa, 30/30 bloccato', async () => {
    const ok = await applyMetering(fakeSupabase({ usage: { normeTooltip: 29 } }), 'token', 'normeTooltip');
    assert.equal(ok.ok, true);
    const ko = await applyMetering(fakeSupabase({ usage: { normeTooltip: 30 } }), 'token', 'normeTooltip');
    assert.equal(ko.ok, false);
});
