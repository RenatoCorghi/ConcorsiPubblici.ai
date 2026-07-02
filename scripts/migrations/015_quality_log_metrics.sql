-- ============================================================
-- Migration 015 — Metriche di latenza/compressione su rag_quality_log
--
-- Supporto per le proposte C (compressione contesto, api/_context-compress.js,
-- env RAG_COMPRESS=1) e D (scheduler deadline-aware, api/_retrieval-budget.js,
-- env RAG_DEADLINE=1), più la misura di latenza del retrieval che serve
-- anche a quantificare i benefici di cascata (RAG_CASCADE) e cache
-- (RAG_SEMANTIC_CACHE) in produzione:
--
--   retrieval_ms        durata totale di fetchRAGContext (cache hit ~decine
--                       di ms, miss = pipeline completa)
--   context_chars_in    caratteri del contesto PRIMA della compressione
--   context_chars_out   caratteri DOPO (NULL se RAG_COMPRESS spenta)
--   degradations        decisioni dello scheduler, CSV (es. "skip_rerank",
--                       "cap_subqueries"); NULL se nessuna o RAG_DEADLINE spenta
--
-- Query utili:
--   -- risparmio medio compressione:
--   SELECT avg(1.0 - context_chars_out::float / context_chars_in) AS saved
--   FROM rag_quality_log WHERE context_chars_in > 0;
--   -- latenza retrieval per esito cache:
--   SELECT cache_status, count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY retrieval_ms) AS p50
--   FROM rag_quality_log WHERE retrieval_ms IS NOT NULL GROUP BY 1;
--
-- Eseguire con: node scripts/migrations/run_migration_015.mjs
-- oppure incollando l'intero file nell'SQL Editor di Supabase.
-- ============================================================

-- ===SPLIT===

ALTER TABLE rag_quality_log
    ADD COLUMN IF NOT EXISTS retrieval_ms int,
    ADD COLUMN IF NOT EXISTS context_chars_in int,
    ADD COLUMN IF NOT EXISTS context_chars_out int,
    ADD COLUMN IF NOT EXISTS degradations text;

-- ===SPLIT===

NOTIFY pgrst, 'reload schema';
