-- ============================================================
-- BLOCCO 2/4 — Indice GIN per Full-Text Search
-- Incolla ed esegui dopo il Blocco 1.
-- (Potrebbe richiedere 1-2 minuti su DB grande)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_rag_chunks_fts ON rag_chunks USING GIN (fts);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_materia ON rag_chunks (materia);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tipo ON rag_chunks (tipo);
