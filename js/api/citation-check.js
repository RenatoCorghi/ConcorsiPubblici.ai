/* ============================================================
   CITATION CHECK — Verifica tiered delle citazioni giurisprudenziali
   Condiviso tra Lezione (tutte le modalità) e Svolgimento Modello.

   Livelli di verifica:
   0) Bypass per sentenze certificate (estratte dinamicamente dalle
      VERITÀ DOGMATICHE + esempi citati nei prompt)
   1) Ricerca nel RAG locale della sessione + check associazione tematica
   2) Verifica globale nel DB via /api/proxy (feature verifyCitation)
   ============================================================ */
import veritaDogmaticheData from '../../data/verita_dogmatiche.json';

// Sentenze citate come ESEMPI nei prompt di sistema: il modello può riprodurle,
// non vanno flaggate come allucinazioni.
const PROMPT_EXAMPLE_KEYS = ['35823/2023', '18084/2025'];

// Estrae dinamicamente i numeri di sentenza certificati dalle verità dogmatiche.
// (Prima erano hardcoded in lezione.js e andavano fuori sync col JSON.)
// Prefix-aware: prende solo i numeri preceduti da un riferimento a una Corte,
// per non includere numeri di legge (es. "L. 212/2000").
export const DOGMATIC_CITATION_KEYS = (() => {
    const keys = new Set(PROMPT_EXAMPLE_KEYS);
    const re = /(?:cass(?:azione)?\.?|sezioni\s+unite|ss\.?\s*uu\.?|s\.?u\.?|cons\.?\s*(?:di\s*)?stato|corte\s+cost(?:ituzionale)?\.?|ad(?:unanza)?\.?\s*plen(?:aria)?\.?)[^.\n]{0,40}?n\.?\s*([0-9]{1,6})\s*\/\s*(20[0-9]{2})/gi;
    for (const v of veritaDogmaticheData) {
        const text = `${v.titolo || ''} ${v.contenuto || ''} ${v.fonte || ''}`;
        let m;
        while ((m = re.exec(text)) !== null) keys.add(`${m[1]}/${m[2]}`);
    }
    return keys;
})();

/**
 * Estrae tutte le citazioni giurisprudenziali numeriche da un testo.
 * Copre: prefissi espliciti (Cass., Cons. Stato, TAR, Corte Cost., SS.UU.,
 * Sezioni Unite, Adunanza Plenaria), formato con data interposta
 * ("sent. 14 marzo 2024, n. 7123") e citazioni concatenate ("e n. 5073/2023").
 */
export function extractCitations(text) {
    const found = [];
    const seen = new Set();
    const push = (num, year, m) => {
        const key = `${num}/${year}`;
        if (!seen.has(key)) {
            seen.add(key);
            found.push({
                num,
                year,
                citationKey: key,
                fullMatch: m[0].substring(0, 60),
                index: m.index,
                matchLength: m[0].length
            });
        }
    };

    // Pass 1: prefisso esplicito di una Corte
    const rePrefixed = /(?:cass(?:azione)?\.?|cons\.?\s*(?:di\s*)?stato|consiglio\s+di\s+stato|t\.?a\.?r\.?|corte\s+cost(?:ituzionale)?\.?|ss\.?\s*uu\.?|sez(?:ioni)?\.?\s*un(?:ite)?\.?|ad(?:unanza)?\.?\s*plen(?:aria)?\.?)[^.\n]{0,80}?(?:n\.?|num\.?|numero)\s*([0-9]{1,6})\s*\/\s*(20[0-9]{2})/gi;
    let m;
    while ((m = rePrefixed.exec(text)) !== null) push(m[1], m[2], m);

    // Pass 2: formato con data interposta — "sentenza 14 marzo 2024, n. 7123"
    // (qui l'anno precede il numero: gruppi invertiti)
    const reDated = /(?:sent(?:enza)?\.?|ord(?:inanza)?\.?|pronuncia|decisione)\s+(?:del\s+)?\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20[0-9]{2})\s*,?\s*n\.?\s*([0-9]{1,6})/gi;
    while ((m = reDated.exec(text)) !== null) push(m[2], m[1], m);

    // Pass 3: citazioni concatenate dopo una primaria — "e n. 18084/2025", ", n. 5073/2023"
    const reChained = /(?:e|,|ed)\s+n\.?\s*([0-9]{3,6})\s*\/\s*(20[0-9]{2})/gi;
    while ((m = reChained.exec(text)) !== null) push(m[1], m[2], m);

    return found;
}

/**
 * Estrae entità giuridiche chiave da un testo per il confronto semantico
 * citazione ↔ fonte RAG (articoli di legge + lemmi tecnici).
 */
export function extractLegalEntities(text) {
    const entities = [];
    const lower = text.toLowerCase();

    const artRegex = /art\.?\s*(\d+[\w-]*)\s*(?:c\.?\s*(?:c|p|proc)?\.?\s*(?:c|p)?\.?)?/gi;
    let artMatch;
    while ((artMatch = artRegex.exec(lower)) !== null) {
        entities.push('art.' + artMatch[1]);
    }

    const legalTerms = [
        'litisconsorzio', 'simulazione', 'simulato', 'frode', 'nullità', 'annullamento',
        'revocatoria', 'contraddittorio', 'pretermessi', 'litisconsorti', 'legittimazione',
        'risarcimento', 'responsabilità', 'inadempimento', 'risoluzione', 'rescissione',
        'prescrizione', 'decadenza', 'usucapione', 'possesso', 'proprietà', 'servitù',
        'ipoteca', 'pegno', 'fideiussione', 'cessione', 'delegazione', 'espromissione',
        'donazione', 'testamento', 'legittima', 'collazione', 'divisione',
        'liquidatore', 'cancellata', 'accertamento', 'avviso', 'notifica',
        'commissorio', 'leonino', 'causa societatis', 'conferimento', 'trust',
        'autotutela', 'discrezionalità', 'proporzionalità', 'affidamento',
        'concorso', 'tentativo', 'dolo', 'colpa', 'confisca', 'sequestro'
    ];

    for (const term of legalTerms) {
        if (lower.includes(term)) entities.push(term);
    }

    return [...new Set(entities)];
}

/**
 * Verifica tiered di tutte le citazioni di un testo.
 * @param {string} text - Il testo generato dall'AI
 * @param {Array} ragSources - Le fonti RAG della sessione
 * @param {Object} authHeaders - Headers già risolti (con eventuale Bearer token)
 * @returns {{verified: string[], unverified: string[], mismatched: string[]}}
 */
export async function verifyCitationsTiered(text, ragSources, authHeaders) {
    const verified = [];
    const unverified = [];
    const mismatched = [];

    for (const cit of extractCitations(text)) {
        // LIVELLO 0: bypass per sentenze certificate
        if (DOGMATIC_CITATION_KEYS.has(cit.citationKey)) {
            verified.push('n. ' + cit.citationKey + ' (certificata)');
            continue;
        }

        // Contesto della citazione nel testo generato (±150 chars)
        const ctxStart = Math.max(0, cit.index - 150);
        const ctxEnd = Math.min(text.length, cit.index + cit.matchLength + 150);
        const citationContext = text.substring(ctxStart, ctxEnd).toLowerCase();

        // LIVELLO 1: ricerca nel RAG locale
        const matchingSource = (ragSources && ragSources.length > 0) ? ragSources.find(s => {
            const content = (s.fullContent || s.content || s.snippet || '').toLowerCase();
            return content.includes(cit.citationKey) || content.includes('n. ' + cit.num);
        }) : null;

        if (!matchingSource) {
            // LIVELLO 2: verifica globale nel DB
            try {
                const verifyRes = await fetch('/api/proxy', {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ feature: 'verifyCitation', citationNumber: cit.citationKey })
                });
                const verifyData = await verifyRes.json();
                if (verifyData.found) {
                    verified.push('n. ' + cit.citationKey);
                    console.log(`[CitationCheck] ✅ Verifica globale: ${cit.citationKey} → trovata nel DB (${verifyData.count} chunk)`);
                    continue;
                }
            } catch (e) {
                console.warn('[CitationCheck] Verifica globale fallita:', e.message);
            }
            unverified.push('n. ' + cit.citationKey);
        } else {
            // Numero presente nel RAG → verifica associazione tematica (anti-mismatch)
            const sourceContent = (matchingSource.fullContent || matchingSource.content || matchingSource.snippet || '').toLowerCase();
            const legalEntities = extractLegalEntities(citationContext);
            const ragEntities = extractLegalEntities(sourceContent);

            const commonEntities = legalEntities.filter(e => ragEntities.includes(e));
            const contextWords = citationContext.split(/\s+/).filter(w => w.length > 4);
            const ragWords = new Set(sourceContent.split(/\s+/).filter(w => w.length > 4));
            const wordOverlap = contextWords.filter(w => ragWords.has(w)).length;
            const overlapRatio = contextWords.length > 0 ? wordOverlap / contextWords.length : 0;

            if (commonEntities.length < 2 && overlapRatio < 0.15) {
                mismatched.push('n. ' + cit.citationKey);
            }
        }
    }

    return {
        verified: [...new Set(verified)],
        unverified: [...new Set(unverified)],
        mismatched: [...new Set(mismatched)]
    };
}
