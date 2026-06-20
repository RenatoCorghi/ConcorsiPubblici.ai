/* Test del modello puro AudioTimeline (js/controllers/audio-timeline.js):
   la matematica che regge lo scrubber, l'evidenziazione del testo e lo
   scorrimento delle slide. La riproduzione Web Audio non è testabile in
   Node, ma TUTTA la logica di posizioni/seek vive qui ed è coperta. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioTimeline, estimateDuration } from '../../js/controllers/audio-timeline.js';

test('start e total con durate stimate', () => {
    const tl = new AudioTimeline([{ estDuration: 10 }, { estDuration: 20 }, { estDuration: 5 }]);
    assert.equal(tl.start(0), 0);
    assert.equal(tl.start(1), 10);
    assert.equal(tl.start(2), 30);
    assert.equal(tl.total, 35);
});

test('la durata reale prevale sulla stima e sposta gli inizi', () => {
    const tl = new AudioTimeline([{ estDuration: 10 }, { estDuration: 20 }]);
    tl.setRealDuration(0, 12.5);
    assert.equal(tl.duration(0), 12.5);
    assert.equal(tl.start(1), 12.5);
    assert.equal(tl.total, 32.5);
    assert.equal(tl.isFullyMeasured, false, 'manca ancora la durata reale del seg 1');
    tl.setRealDuration(1, 18);
    assert.equal(tl.isFullyMeasured, true);
    assert.equal(tl.total, 30.5);
});

test('resolve trova il segmento e l\'offset; sul confine preferisce il successivo', () => {
    const tl = new AudioTimeline([{ estDuration: 10 }, { estDuration: 20 }, { estDuration: 5 }]);
    assert.deepEqual(tl.resolve(0), { index: 0, offset: 0 });
    assert.deepEqual(tl.resolve(5), { index: 0, offset: 5 });
    assert.deepEqual(tl.resolve(10), { index: 1, offset: 0 }, 'confine 10 → inizio seg 1');
    assert.deepEqual(tl.resolve(25), { index: 1, offset: 15 });
    assert.deepEqual(tl.resolve(31), { index: 2, offset: 1 });
});

test('resolve fa clamp sotto zero, oltre la fine e su valori non validi', () => {
    const tl = new AudioTimeline([{ estDuration: 10 }, { estDuration: 20 }]);
    assert.deepEqual(tl.resolve(-5), { index: 0, offset: 0 });
    assert.deepEqual(tl.resolve(999), { index: 1, offset: 20 }, 'oltre la fine → fine ultimo seg');
    assert.deepEqual(tl.resolve(NaN), { index: 0, offset: 0 });
    assert.deepEqual(tl.resolve(Infinity), { index: 1, offset: 20 });
});

test('globalTime è l\'inverso di resolve', () => {
    const tl = new AudioTimeline([{ estDuration: 10 }, { estDuration: 20 }, { estDuration: 5 }]);
    assert.equal(tl.globalTime(1, 15), 25);
    const r = tl.resolve(25);
    assert.equal(tl.globalTime(r.index, r.offset), 25, 'seek e ritorno devono combaciare');
});

test('timeline vuota non esplode', () => {
    const tl = new AudioTimeline([]);
    assert.equal(tl.length, 0);
    assert.equal(tl.total, 0);
    assert.equal(tl.isFullyMeasured, false);
    assert.deepEqual(tl.resolve(10), { index: 0, offset: 0 });
});

test('indici fuori range sono gestiti', () => {
    const tl = new AudioTimeline([{ estDuration: 10 }]);
    assert.equal(tl.duration(5), 0);
    tl.setRealDuration(5, 99);   // no-op, non deve lanciare
    assert.equal(tl.duration(5), 0);
});

test('estimateDuration: cresce col testo, minimo 1s, niente valori strani', () => {
    assert.ok(estimateDuration('una due tre quattro') > 0);
    assert.ok(estimateDuration('parola '.repeat(100)) > estimateDuration('parola '.repeat(10)));
    assert.equal(estimateDuration(''), 1, 'testo vuoto → minimo 1s');
    assert.equal(estimateDuration(null), 1);
});
