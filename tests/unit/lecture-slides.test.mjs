/* Test delle funzioni pure per le slide AI (lecture-content.js):
   costruzione del prompt e merge DIFENSIVO della risposta del modello.
   La chiamata di rete vive nella vista e non è testata qui. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// lecture-content.js importa escapeHtml da utils.js, che a livello di modulo
// fa `window.showToast = ...`. In Node window non esiste: stub minimo prima
// dell'import. Le funzioni testate qui (prompt/merge) non usano escapeHtml.
globalThis.window = globalThis.window || {};
const { buildSlidePrompt, mergeAISlides } = await import('../../js/controllers/lecture-content.js');

const blocks = [
    { index: 0, ttsText: 'La legittima difesa esclude la punibilita.' },
    { index: 1, ttsText: 'Il requisito della proporzione e centrale.' },
    { index: 2, ttsText: 'Eccesso colposo ex art 55.' }
];
const slidesFixture = () => [
    { index: 0, moduleNum: 1, blockStart: 0, blockEnd: 1, title: 'euristico A', bullets: ['x'], articles: ['art. 52 c.p.'], aiEnhanced: false },
    { index: 1, moduleNum: 1, blockStart: 2, blockEnd: 2, title: 'euristico B', bullets: ['y'], articles: [], aiEnhanced: false }
];

test('buildSlidePrompt include una sezione per ogni slide e il formato JSON atteso', () => {
    const p = buildSlidePrompt(slidesFixture(), blocks);
    assert.match(p, /### SLIDE 1/);
    assert.match(p, /### SLIDE 2/);
    assert.match(p, /La legittima difesa/);     // testo del blocco 0 (slide 1)
    assert.match(p, /Eccesso colposo/);          // testo del blocco 2 (slide 2)
    assert.match(p, /"slides"/);                  // formato richiesto
});

test('mergeAISlides sostituisce titolo/bullet e marca aiEnhanced, tiene gli articoli', () => {
    const slides = slidesFixture();
    const n = mergeAISlides(slides, { slides: [
        { i: 1, title: 'La scriminante della difesa', bullets: ['Esclude la punibilità', 'Richiede proporzione'] },
        { i: 2, title: 'Eccesso colposo', bullets: ['Superamento colposo dei limiti'] }
    ]});
    assert.equal(n, 2);
    assert.equal(slides[0].title, 'La scriminante della difesa');
    assert.deepEqual(slides[0].bullets, ['Esclude la punibilità', 'Richiede proporzione']);
    assert.equal(slides[0].aiEnhanced, true);
    assert.deepEqual(slides[0].articles, ['art. 52 c.p.'], 'gli articoli regex restano');
});

test('mergeAISlides limita i bullet a 4 e scarta stringhe vuote', () => {
    const slides = slidesFixture();
    mergeAISlides(slides, { slides: [
        { i: 1, title: 'T', bullets: ['a', '', '  ', 'b', 'c', 'd', 'e'] }
    ]});
    assert.deepEqual(slides[0].bullets, ['a', 'b', 'c', 'd']);
});

test('mergeAISlides è difensivo: input malformato → 0 merge, slide intatte', () => {
    assert.equal(mergeAISlides(slidesFixture(), null), 0);
    assert.equal(mergeAISlides(slidesFixture(), {}), 0);
    assert.equal(mergeAISlides(slidesFixture(), { slides: 'nope' }), 0);
    const slides = slidesFixture();
    const n = mergeAISlides(slides, { slides: [{ i: 99, title: 'fuori range' }, { i: 1 }] });
    assert.equal(n, 0, 'indice fuori range + item senza title/bullets → nessun merge');
    assert.equal(slides[0].title, 'euristico A', 'slide invariata');
    assert.equal(slides[0].aiEnhanced, false);
});

test('mergeAISlides: solo titolo (senza bullets) aggiorna comunque', () => {
    const slides = slidesFixture();
    const n = mergeAISlides(slides, { slides: [{ i: 1, title: 'Nuovo titolo' }] });
    assert.equal(n, 1);
    assert.equal(slides[0].title, 'Nuovo titolo');
    assert.deepEqual(slides[0].bullets, ['x'], 'i bullet euristici restano se l\'AI non ne dà');
});
