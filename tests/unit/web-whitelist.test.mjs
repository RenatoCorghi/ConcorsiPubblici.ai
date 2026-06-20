/* Test della whitelist domini per la ricerca web (isWebDomainAllowed in
   api/proxy.js): è la rete di sicurezza che impedisce di mostrare/usare fonti
   fuori dalla lista GREEN LIGHT (compliance copyright/licenze). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWebDomainAllowed } from '../../api/proxy.js';

test('domini consentiti → true (scheme-agnostic)', () => {
    assert.equal(isWebDomainAllowed('https://www.normattiva.it/atto/123'), true);
    assert.equal(isWebDomainAllowed('http://normattiva.it'), true);
    assert.equal(isWebDomainAllowed('https://eur-lex.europa.eu/legal-content/IT/'), true);
    assert.equal(isWebDomainAllowed('https://mdpi.com/journal/x'), true);
});

test('sottodomini di un dominio consentito → true', () => {
    assert.equal(isWebDomainAllowed('https://openga.giustizia-amministrativa.it/x'), true);
    assert.equal(isWebDomainAllowed('https://www.giustizia-amministrativa.it/'), true);
});

test('prefisso www normalizzato', () => {
    assert.equal(isWebDomainAllowed('https://www.giureta.unipa.it/articolo'), true);
});

test('fonti consentite solo su un path: la root resta esclusa', () => {
    // SentenzeWeb consentito SOLO su /sncass
    assert.equal(isWebDomainAllowed('https://italgiure.giustizia.it/sncass/sentenze'), true);
    assert.equal(isWebDomainAllowed('https://italgiure.giustizia.it/'), false, 'root italgiure VIETATA');
    assert.equal(isWebDomainAllowed('https://italgiure.giustizia.it/altrabanca'), false);
    // Cardozo consentito solo sul suo path
    assert.equal(isWebDomainAllowed('https://ojs.unito.it/index.php/cardozo/article/1'), true);
    assert.equal(isWebDomainAllowed('https://ojs.unito.it/index.php/rivista-vietata'), false);
});

test('domini NON in whitelist → false (banche dati e riviste NC)', () => {
    assert.equal(isWebDomainAllowed('https://dejure.it/sentenza'), false);
    assert.equal(isWebDomainAllowed('https://iusexplorer.it/x'), false);
    assert.equal(isWebDomainAllowed('https://www.sistemapenale.it/articolo'), false);
    assert.equal(isWebDomainAllowed('https://it.wikipedia.org/wiki/Diritto'), false);
});

test('finto match per substring NON deve passare', () => {
    // un dominio che CONTIENE un dominio consentito non è consentito
    assert.equal(isWebDomainAllowed('https://normattiva.it.evil.com/x'), false);
    assert.equal(isWebDomainAllowed('https://fakemdpi.com/x'), false);
});

test('URL malformati o vuoti → false, niente crash', () => {
    assert.equal(isWebDomainAllowed(''), false);
    assert.equal(isWebDomainAllowed(null), false);
    assert.equal(isWebDomainAllowed('non-un-url'), false);
    assert.equal(isWebDomainAllowed('javascript:alert(1)'), false);
});
