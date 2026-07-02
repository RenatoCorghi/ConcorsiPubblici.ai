/* ============================================================
   _CONTEXT-COMPRESS.JS — Compressione strutturale del contesto RAG
   con integrità garantita delle citazioni
   (il prefisso "_" evita che Vercel esponga il file come endpoint)

   PROBLEMA: i top-8 chunk del retrieval sono spesso ridondanti — la
   stessa massima o lo stesso articolo ricorrono in più schede. Ogni
   byte ridondante nel prompt è computazione, latenza e costo sprecati
   sull'inferenza del provider.

   MECCANISMO (deterministico, zero chiamate esterne):
   1. Ogni chunk è spezzato in FRASI con uno splitter consapevole delle
      abbreviazioni giuridiche ("art.", "Cass.", "Sez. Un.", "D.Lgs.",
      "n. 241/1990" non chiudono la frase).
   2. Ogni frase è ridotta a un insieme di shingle di 8 parole; la
      ridondanza è la frazione di shingle già visti nelle fonti
      precedenti (che hanno rank più alto: si scarta sempre la copia
      peggiore, mai l'originale).
   3. VINCOLO DI INTEGRITÀ: la granularità è la frase intera — nessuna
      citazione (estremi di sentenza, riferimenti normativi) può essere
      troncata a metà. Le frasi che CONTENGONO citazioni sono protette:
      si scartano solo se duplicate quasi alla lettera (soglia 0.98
      contro 0.80 delle frasi normali).
   4. BUDGET: oltre i primi PROTECTED_TOP_ITEMS chunk, il contenuto che
      eccede il budget di caratteri viene tagliato a granularità di
      frase (mai a metà frase).

   Le sources per il frontend NON passano di qui: fullContent resta
   integro per la verifica citazioni lato client (citation-check.js).
   ============================================================ */

const DEFAULT_BUDGET_CHARS = 20000;
const SHINGLE_SIZE = 8;
const REDUNDANCY_DROP = 0.80;           // frase normale: via se ≥80% già vista
const REDUNDANCY_DROP_PROTECTED = 0.98; // frase con citazione: solo duplicato ~esatto
const MIN_SENTENCE_CHARS = 25;          // header/etichette: tenuti salvo duplicato esatto
const PROTECTED_TOP_ITEMS = 3;          // i primi N chunk non subiscono tagli da budget

// Citazione = estremi di sentenza (n. 1234/2020) o riferimento normativo
// (art. 21-nonies). Specchio semplificato dei pattern di
// js/api/citation-check.js — se cambiano lì, allineare qui.
const CITATION_RE = /(?:\bn\.?\s*\d{1,6}\s*\/\s*(?:19|20)\d{2}\b)|(?:\bart(?:t)?\.?\s*\d+(?:\s*-\s*[a-z]+|-[a-z]+)?)/i;

// Abbreviazioni giuridiche dopo cui un punto NON chiude la frase
const ABBREV_RE = /\b(?:art|artt|n|nn|nr|cass|sez|un|civ|pen|amm|trib|lav|cfr|lgs|lg|l|ll|d|dd|c|p|co|comma|lett|pag|pagg|par|op|cit|loc|ss|uu|v|vd|vol|cap|cost|cod|proc|disp|att|reg|delib|ord|sent|st|cons|conv|prot|doc|all|es|ecc|etc|dott|avv|prof|rel|r|g|u)\.$/i;

/**
 * Divide un testo in frasi rispettando le abbreviazioni giuridiche.
 * Prima spezza per righe (i chunk hanno struttura a paragrafi), poi ogni
 * riga sui punti seguiti da spazio + maiuscola/cifra, saltando i punti
 * che chiudono un'abbreviazione nota.
 */
export function splitSentences(text) {
    const out = [];
    for (const line of String(text || '').split(/\n+/)) {
        const t = line.trim();
        if (!t) continue;
        let start = 0;
        const re = /\.\s+(?=[A-ZÀ-ÖÙ-Ý«"(\d])/g;
        let m;
        while ((m = re.exec(t)) !== null) {
            const before = t.slice(start, m.index + 1);
            if (ABBREV_RE.test(before.trimEnd())) continue;
            const sentence = before.trim();
            if (sentence) out.push(sentence);
            start = m.index + 1;
        }
        const rest = t.slice(start).trim();
        if (rest) out.push(rest);
    }
    return out;
}

/** Insieme di shingle (8-gram di parole normalizzate) di una frase. */
export function shingleSet(sentence) {
    const words = String(sentence || '')
        .toLowerCase()
        .replace(/[^a-zà-ÿ0-9]+/gi, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1);
    const set = new Set();
    if (words.length === 0) return set;
    if (words.length < SHINGLE_SIZE) {
        set.add(words.join(' '));
        return set;
    }
    for (let i = 0; i + SHINGLE_SIZE <= words.length; i++) {
        set.add(words.slice(i, i + SHINGLE_SIZE).join(' '));
    }
    return set;
}

/**
 * Comprime i contenuti del contesto RAG (in ordine di rank).
 * @param {Array<{content: string}>} items - chunk già puliti, rank order
 * @param {Object} opts - { budgetChars }
 * @returns {{ contents: string[], stats: Object }} contenuti compressi
 *   (stringa vuota = chunk interamente ridondante) + statistiche
 */
export function compressContext(items, opts = {}) {
    const budgetChars = opts.budgetChars ?? DEFAULT_BUDGET_CHARS;
    const seen = new Set();
    const contents = [];
    let charsIn = 0;
    let charsOut = 0;
    let sentDeduped = 0;
    let sentBudgetCut = 0;
    let itemsTruncated = 0;

    items.forEach((item, idx) => {
        const content = String(item?.content || '');
        charsIn += content.length;
        const kept = [];
        let truncatedHere = false;

        for (const s of splitSentences(content)) {
            const sh = shingleSet(s);
            let redundancy = 0;
            if (sh.size > 0) {
                let hit = 0;
                for (const g of sh) if (seen.has(g)) hit++;
                redundancy = hit / sh.size;
            }
            const isProtected = CITATION_RE.test(s);
            const isTiny = s.length < MIN_SENTENCE_CHARS;
            const threshold = isProtected ? REDUNDANCY_DROP_PROTECTED : REDUNDANCY_DROP;

            // Dedup: gli header/etichette minuscoli si scartano solo se già
            // visti alla lettera (redundancy 1 con singolo shingle)
            if (redundancy >= (isTiny ? 1 : threshold)) {
                sentDeduped++;
                continue;
            }

            // Budget: mai sui primi PROTECTED_TOP_ITEMS chunk; oltre, il
            // taglio è a granularità di frase (mai a metà frase)
            if (idx >= PROTECTED_TOP_ITEMS && charsOut + s.length > budgetChars) {
                truncatedHere = true;
                sentBudgetCut++;
                break;
            }

            kept.push(s);
            charsOut += s.length + 1; // +1 per il newline di join
            for (const g of sh) seen.add(g);
        }

        if (truncatedHere) itemsTruncated++;
        contents.push(kept.join('\n'));
    });

    return {
        contents,
        stats: {
            charsIn,
            charsOut,
            sentDeduped,
            sentBudgetCut,
            itemsTruncated,
            ratio: charsIn > 0 ? charsOut / charsIn : 1
        }
    };
}
