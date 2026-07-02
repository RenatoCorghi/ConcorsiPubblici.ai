/* ============================================================
   _RETRIEVAL-BUDGET.JS — Scheduler deadline-aware per la pipeline RAG
   (il prefisso "_" evita che Vercel esponga il file come endpoint)

   PROBLEMA: gli stadi del retrieval (expansion ~1-2s, embedding ~0.5s,
   ricerca, re-rank LLM ~5-8s) hanno timeout fissi e indipendenti: uno
   stadio lento ruba tempo a quelli successivi e alla generazione, e
   un'invocazione uccisa dalla piattaforma a metà è computazione
   sprecata al 100%.

   MECCANISMO: un ledger di budget unico per la richiesta.
   - budget effettivo = min(budget configurato, deadline di piattaforma
     − tempo già trascorso − riserva per la generazione)
   - ogni stadio dichiara una stima: se il budget residuo non basta, lo
     stadio viene SALTATO o DEGRADATO (niente expansion, niente re-rank,
     sotto-query cappate, timeout ridotti) invece di sforare
   - ogni decisione è registrata (ledger + degradations) e finisce nei
     log di qualità: la degradazione è osservabile, mai silenziosa.

   Con enabled=false ogni metodo è pass-through: comportamento identico
   alla pipeline senza scheduler.
   ============================================================ */

export function createRetrievalBudget({
    enabled = false,
    totalMs = 9000,
    requestStartMs = null,
    maxDurationMs = null,
    generationReserveMs = 60000
} = {}) {
    const startedAt = Date.now();

    // Deadline di piattaforma: se nota, il budget si restringe per lasciare
    // la riserva alla generazione (su Vercel Pro 300s non stringe quasi mai,
    // ma il meccanismo è ciò che garantisce il completamento entro deadline)
    let effectiveTotal = totalMs;
    if (enabled && requestStartMs && maxDurationMs) {
        const platformRemaining = maxDurationMs - (startedAt - requestStartMs) - generationReserveMs;
        effectiveTotal = Math.max(1000, Math.min(totalMs, platformRemaining));
    }

    const ledger = [];
    const degradations = [];
    const remaining = () => effectiveTotal - (Date.now() - startedAt);

    return {
        enabled,
        totalMs: effectiveTotal,
        ledger,
        degradations,
        remaining,

        /** Lo stadio entra solo se il residuo copre la stima; altrimenti
         *  viene registrata la degradazione e si procede senza. */
        canAfford(stage, estimateMs) {
            if (!enabled) return true;
            if (remaining() >= estimateMs) return true;
            degradations.push(`skip_${stage}`);
            return false;
        },

        /** Registra una degradazione decisa dal chiamante (es. cap sotto-query). */
        degrade(reason) {
            if (enabled) degradations.push(reason);
        },

        /** Timeout adattivo: mai oltre il residuo, mai sotto il floor. */
        clampTimeout(defaultMs, floorMs = 1000) {
            if (!enabled) return defaultMs;
            return Math.max(floorMs, Math.min(defaultMs, remaining()));
        },

        /** Esegue uno stadio misurandone la spesa effettiva nel ledger. */
        async spend(stage, fn) {
            const t0 = Date.now();
            try {
                return await fn();
            } finally {
                ledger.push({ stage, ms: Date.now() - t0 });
            }
        },

        /** Riepilogo leggibile per i log. */
        summary() {
            const spent = Date.now() - startedAt;
            const stages = ledger.map(l => `${l.stage} ${l.ms}ms`).join(' | ') || 'nessuno stadio misurato';
            const deg = degradations.length ? ` | degradazioni: ${degradations.join(',')}` : '';
            return `${stages} | totale ${spent}/${effectiveTotal}ms${deg}`;
        }
    };
}
