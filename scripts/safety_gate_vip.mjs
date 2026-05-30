/**
 * Safety Gate per la generazione di Schede VIP
 * 
 * Previene la generazione di schede VIP da sentenze "oscurate" (privacy)
 * o da PDF vuoti/corrotti. Senza questo gate, l'AI fabbricherebbe
 * un'analisi giuridica completa usando il numero corretto ma con
 * contenuto totalmente inventato, causando false associazioni nel RAG.
 * 
 * Uso:
 *   const { shouldSkip } = require('./safety_gate_vip');
 *   const result = shouldSkip(text, filename);
 *   if (result.skip) { console.warn(result.reason); continue; }
 */

const OSCURAMENTO_PATTERNS = [
    /in fase di oscuramento/i,
    /sentenza richiesta.*oscuramento/i,
    /provvedimento.*non.*disponibile/i,
    /testo.*non.*(?:ancora\s+)?disponibile/i,
    /documento.*non.*reperibile/i,
    /pagina non trovata/i,
    /errore nel recupero/i,
    /accesso negato/i
];

const MIN_CONTENT_LENGTH = 1000; // Caratteri minimi di contenuto reale

function shouldSkip(text, filename = '') {
    if (!text || typeof text !== 'string') {
        return { skip: true, reason: `🚫 SKIP (testo vuoto o nullo): ${filename}` };
    }

    // Check oscuramento
    const isOscurato = OSCURAMENTO_PATTERNS.some(p => p.test(text));
    if (isOscurato) {
        return { skip: true, reason: `🚫 SKIP (sentenza oscurata): ${filename}` };
    }

    // Check lunghezza minima
    const strippedText = text.replace(/\s+/g, ' ').trim();
    if (strippedText.length < MIN_CONTENT_LENGTH) {
        return { skip: true, reason: `⚠️ SKIP (contenuto troppo breve: ${strippedText.length} chars): ${filename}` };
    }

    return { skip: false };
}

// Export sia CJS che ESM
if (typeof module !== 'undefined') {
    module.exports = { shouldSkip, OSCURAMENTO_PATTERNS, MIN_CONTENT_LENGTH };
}
export { shouldSkip, OSCURAMENTO_PATTERNS, MIN_CONTENT_LENGTH };
