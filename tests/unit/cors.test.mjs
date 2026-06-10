/* Test del perimetro CORS (api/_cors.js).
   La regex dei preview Vercel è un punto delicato: una regex troppo aperta
   permetterebbe a qualsiasi sito *.vercel.app di consumare l'API. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOriginAllowed } from '../../api/_cors.js';

test('domini di produzione ammessi', () => {
    assert.equal(isOriginAllowed('https://concorsipubblici.ai'), true);
    assert.equal(isOriginAllowed('https://www.concorsipubblici.ai'), true);
});

test('localhost di sviluppo ammessi', () => {
    assert.equal(isOriginAllowed('http://localhost:5173'), true);
    assert.equal(isOriginAllowed('http://localhost:3000'), true);
    assert.equal(isOriginAllowed('http://127.0.0.1:5173'), true);
});

test('preview Vercel del progetto ammessi', () => {
    assert.equal(isOriginAllowed('https://concorsipubblici.vercel.app'), true);
    assert.equal(isOriginAllowed('https://concorsi-ai-git-main-renato.vercel.app'), true);
});

test('siti Vercel di terzi rifiutati', () => {
    assert.equal(isOriginAllowed('https://malicious-site.vercel.app'), false);
    assert.equal(isOriginAllowed('https://evil.vercel.app'), false);
});

test('tentativi di bypass della regex rifiutati', () => {
    // Suffisso: il dominio reale è evil.com
    assert.equal(isOriginAllowed('https://concorsi.vercel.app.evil.com'), false);
    // Solo https per i preview
    assert.equal(isOriginAllowed('http://concorsi.vercel.app'), false);
    // Caratteri non ammessi nel nome progetto
    assert.equal(isOriginAllowed('https://concorsi$.vercel.app'), false);
});

test('origin vuota o mancante rifiutata', () => {
    assert.equal(isOriginAllowed(''), false);
    assert.equal(isOriginAllowed(undefined), false);
});
