-- ============================================================
-- Migration 012: tabella di log qualità RAG
--
-- api/proxy.js (logRagQuality) scrive una riga per ogni richiesta RAG:
-- query, materia, n. risultati, punteggio del top result, se il re-rank
-- LLM è stato applicato. Dopo 1-2 settimane di traffico reale si vede
-- DOVE il retrieval fallisce (result_count = 0, top_score basso) e quei
-- casi alimentano l'eval set con domande vere degli utenti.
--
-- Da eseguire nel SQL Editor di Supabase.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS rag_quality_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    feature text,              -- aiCalls, tutorChats, ecc. (la feature richiesta)
    query text,                -- query RAG troncata a 300 char
    materia text,              -- materia normalizzata del filtro (NULL = tutte)
    sub_query_count int,       -- quante sotto-query ha prodotto l'expansion
    skip_expansion boolean,    -- true per le continuazioni di modulo
    reranked boolean,          -- true se il re-rank LLM è andato a buon fine
    result_count int,          -- fonti finite nel contesto (0 = buco!)
    top_score double precision,-- boostedScore della fonte migliore
    top_tipo text,             -- tipo della fonte migliore
    top_titolo text            -- titolo della fonte migliore (troncato)
);

CREATE INDEX IF NOT EXISTS idx_rag_quality_log_created
    ON rag_quality_log (created_at DESC);
-- Indice parziale per la query più importante: "dove non troviamo NULLA?"
CREATE INDEX IF NOT EXISTS idx_rag_quality_log_zero
    ON rag_quality_log (created_at DESC) WHERE result_count = 0;

-- Scrive solo api/proxy.js col service role (che bypassa la RLS).
-- RLS attiva senza policy = nessun accesso per anon/authenticated.
ALTER TABLE rag_quality_log ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================
-- Query utili da tenere a portata (da eseguire quando vuoi):
--
-- Buchi del RAG (nessuna fonte trovata), ultimi 7 giorni:
--   SELECT created_at, materia, query FROM rag_quality_log
--   WHERE result_count = 0 AND created_at > now() - interval '7 days'
--   ORDER BY created_at DESC;
--
-- Qualità media per materia:
--   SELECT materia, count(*) AS richieste,
--          round(avg(top_score)::numeric, 3) AS score_medio,
--          sum(CASE WHEN result_count = 0 THEN 1 ELSE 0 END) AS buchi
--   FROM rag_quality_log GROUP BY materia ORDER BY richieste DESC;
--
-- Pulizia log più vecchi di 60 giorni:
--   DELETE FROM rag_quality_log WHERE created_at < now() - interval '60 days';
-- ============================================================
