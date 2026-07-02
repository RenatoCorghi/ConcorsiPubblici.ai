/* Test dello scheduler deadline-aware (api/_retrieval-budget.js):
   pass-through da spento, degradazioni registrate, clamp dei timeout,
   restringimento per deadline di piattaforma, ledger delle spese. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRetrievalBudget } from '../../api/_retrieval-budget.js';

test('disabilitato → pass-through totale (nessuna degradazione possibile)', () => {
    const b = createRetrievalBudget({ enabled: false, totalMs: 1 });
    assert.equal(b.canAfford('rerank', 999999), true);
    assert.equal(b.clampTimeout(5000), 5000);
    b.degrade('cap_subqueries');
    assert.deepEqual(b.degradations, []);
});

test('budget ampio → gli stadi entrano e il ledger registra le spese', async () => {
    const b = createRetrievalBudget({ enabled: true, totalMs: 60000 });
    assert.equal(b.canAfford('expansion', 2500), true);
    const out = await b.spend('expansion', async () => 'risultato');
    assert.equal(out, 'risultato');
    assert.equal(b.ledger.length, 1);
    assert.equal(b.ledger[0].stage, 'expansion');
    assert.ok(b.ledger[0].ms >= 0);
    assert.ok(b.summary().includes('expansion'));
});

test('budget esaurito → canAfford nega e registra la degradazione', () => {
    const b = createRetrievalBudget({ enabled: true, totalMs: 1000 });
    assert.equal(b.canAfford('rerank', 5500), false);
    assert.deepEqual(b.degradations, ['skip_rerank']);
    assert.ok(b.summary().includes('skip_rerank'));
});

test('clampTimeout: mai oltre il residuo, mai sotto il floor', () => {
    const b = createRetrievalBudget({ enabled: true, totalMs: 3000 });
    const clamped = b.clampTimeout(5000, 1500);
    assert.ok(clamped <= 3000, `atteso <= 3000, trovato ${clamped}`);
    assert.ok(clamped >= 1500);

    const stretto = createRetrievalBudget({ enabled: true, totalMs: 100 });
    assert.equal(stretto.clampTimeout(5000, 1500), 1500); // floor vince
});

test('la deadline di piattaforma restringe il budget (riserva generazione)', () => {
    // Piattaforma: 30s totali, richiesta partita 5s fa, riserva 20s
    // → residuo piattaforma = 30 - 5 - 20 = 5s < budget configurato 9s
    const b = createRetrievalBudget({
        enabled: true,
        totalMs: 9000,
        requestStartMs: Date.now() - 5000,
        maxDurationMs: 30000,
        generationReserveMs: 20000
    });
    assert.ok(b.totalMs <= 5100, `atteso ~5000ms, trovato ${b.totalMs}`);
    assert.ok(b.totalMs >= 1000); // mai sotto il minimo di sicurezza
});

test('spend registra la spesa anche se lo stadio lancia un errore', async () => {
    const b = createRetrievalBudget({ enabled: true, totalMs: 60000 });
    await assert.rejects(b.spend('search', async () => { throw new Error('boom'); }));
    assert.equal(b.ledger.length, 1);
    assert.equal(b.ledger[0].stage, 'search');
});

test('degrade registra motivi custom solo se abilitato', () => {
    const b = createRetrievalBudget({ enabled: true, totalMs: 60000 });
    b.degrade('cap_subqueries');
    assert.deepEqual(b.degradations, ['cap_subqueries']);
});
