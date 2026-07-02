/* Test della compressione strutturale del contesto RAG
   (api/_context-compress.js): splitter consapevole delle abbreviazioni
   giuridiche, dedup a shingle, protezione delle citazioni, budget a
   granularità di frase. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, shingleSet, compressContext } from '../../api/_context-compress.js';

// --- splitSentences ---

test('le abbreviazioni giuridiche non chiudono la frase', () => {
    const txt = "Ai sensi dell'art. 21-nonies della l. n. 241/1990 il provvedimento è annullabile. Il termine è di dodici mesi secondo Cass. Sez. Un. n. 8774/2021 e la giurisprudenza costante.";
    const sentences = splitSentences(txt);
    assert.equal(sentences.length, 2, `attese 2 frasi, trovate ${sentences.length}: ${JSON.stringify(sentences)}`);
    assert.ok(sentences[0].includes('art. 21-nonies'));
    assert.ok(sentences[1].includes('n. 8774/2021'));
});

test('il punto dopo un numero chiude la frase', () => {
    const sentences = splitSentences('La riforma è della l. n. 241/1990. Il principio resta fermo.');
    assert.equal(sentences.length, 2);
});

test('le righe separate restano frasi separate', () => {
    const sentences = splitSentences('MASSIMA:\nIl contratto simulato è nullo.\nRATIO:\nLa tutela dei terzi.');
    assert.equal(sentences.length, 4);
});

test('testo vuoto o solo spazi → nessuna frase', () => {
    assert.deepEqual(splitSentences(''), []);
    assert.deepEqual(splitSentences('  \n  '), []);
});

// --- shingleSet ---

test('frasi corte → un solo shingle; frasi lunghe → n-gram scorrevoli', () => {
    const corta = shingleSet('la simulazione assoluta');
    assert.equal(corta.size, 1);
    const parole12 = 'uno due tre quattro cinque sei sette otto nove dieci undici dodici';
    assert.equal(shingleSet(parole12).size, 5); // 12 parole → 5 shingle da 8
});

test('la normalizzazione ignora punteggiatura e maiuscole', () => {
    const a = shingleSet('La Simulazione, Assoluta!');
    const b = shingleSet('la simulazione assoluta');
    assert.deepEqual([...a], [...b]);
});

// --- compressContext: dedup ---

const FRASE_LUNGA = 'La simulazione assoluta del contratto comporta la nullità totale del negozio apparente tra le parti contraenti secondo la giurisprudenza consolidata della Suprema Corte di Cassazione';
const FRASE_CITAZIONE = 'Il principio è stato affermato dalla Cassazione con la sentenza n. 500/1999 sulla risarcibilità degli interessi legittimi lesi dalla pubblica amministrazione illegittimamente operante';

test('la frase duplicata nella fonte successiva viene rimossa (si tiene la copia col rank migliore)', () => {
    const { contents, stats } = compressContext([
        { content: FRASE_LUNGA + '.' },
        { content: FRASE_LUNGA + '. Aggiunta nuova con contenuto inedito e diverso da tutto il resto del contesto documentale disponibile.' }
    ]);
    assert.ok(contents[0].includes('simulazione assoluta'));
    assert.ok(!contents[1].includes('simulazione assoluta'), 'la copia duplicata doveva sparire');
    assert.ok(contents[1].includes('Aggiunta nuova'));
    assert.ok(stats.sentDeduped >= 1);
    assert.ok(stats.charsOut < stats.charsIn);
});

test('una frase con citazione quasi-duplicata è PROTETTA (soglia 0.98), una normale no', () => {
    // Varianti con aggiunta in coda: tutti gli shingle originali restano →
    // ridondanza ~0.9 (sopra la soglia 0.80 delle frasi normali, sotto la
    // soglia 0.98 delle frasi protette da citazione)
    const varianteCitazione = FRASE_CITAZIONE + ' come noto';
    const varianteNormale = FRASE_LUNGA + ' come noto';
    const { contents } = compressContext([
        { content: FRASE_CITAZIONE + '. ' + FRASE_LUNGA + '.' },
        { content: varianteCitazione + '. ' + varianteNormale + '.' }
    ]);
    assert.ok(contents[1].includes('n. 500/1999'), 'la variante con citazione doveva restare');
    assert.ok(!contents[1].includes('simulazione assoluta'), 'la variante normale doveva sparire');
});

test('nessuna frase in output è tagliata a metà (integrità: ogni riga è una frase di input)', () => {
    const in1 = FRASE_CITAZIONE + '. ' + FRASE_LUNGA + '.';
    const in2 = 'Contenuto del tutto nuovo che parla di responsabilità precontrattuale della pubblica amministrazione appaltante nelle gare pubbliche di rilievo comunitario.';
    const inputSentences = new Set([...splitSentences(in1), ...splitSentences(in2)]);
    const { contents } = compressContext([{ content: in1 }, { content: in2 }]);
    for (const c of contents) {
        for (const line of c.split('\n').filter(Boolean)) {
            assert.ok(inputSentences.has(line), `riga non presente tra le frasi di input: "${line}"`);
        }
    }
});

// --- compressContext: budget ---

test('il budget taglia solo oltre i primi 3 chunk, a granularità di frase', () => {
    const frase = (i) => `Contenuto originale numero ${i} con parole sempre diverse per evitare qualsiasi sovrapposizione di shingle tra le fonti considerate nel presente scenario di collaudo numero ${i}.`;
    const items = Array.from({ length: 6 }, (_, i) => ({ content: frase(i) + ' ' + frase(i + 100) }));
    const { contents, stats } = compressContext(items, { budgetChars: 700 });
    // I primi 3 chunk sono intatti anche fuori budget
    for (let i = 0; i < 3; i++) {
        assert.ok(contents[i].length > 0, `chunk ${i} doveva restare`);
    }
    // Gli ultimi subiscono il taglio
    assert.ok(stats.itemsTruncated >= 1, 'atteso almeno un chunk troncato dal budget');
    assert.ok(contents[5].length < items[5].content.length);
});

test('senza ridondanza né budget stretto, l\'output preserva tutto il contenuto', () => {
    const a = 'Prima frase totalmente originale del primo documento in esame con abbondanza di parole differenti.';
    const b = 'Seconda frase del tutto distinta della seconda fonte considerata con lessico completamente diverso.';
    const { contents, stats } = compressContext([{ content: a }, { content: b }], { budgetChars: 100000 });
    assert.equal(contents[0], a);
    assert.equal(contents[1], b);
    assert.equal(stats.sentDeduped, 0);
    assert.equal(stats.itemsTruncated, 0);
});

test('input degenere: array vuoto e contenuti nulli non rompono nulla', () => {
    assert.deepEqual(compressContext([]).contents, []);
    const { contents } = compressContext([{ content: null }, {}]);
    assert.deepEqual(contents, ['', '']);
});
