-- ============================================================
-- BLOCCO 1/4 — Colonna fts + Popola righe esistenti
-- Incolla ed esegui questo primo, poi passa al Blocco 2.
-- ============================================================

-- Aggiunge la colonna tsvector (se non esiste già)
ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS fts tsvector;

-- Popola le righe esistenti con lo stemming italiano
-- (potrebbe richiedere 30-60 secondi su 7000+ righe)
UPDATE rag_chunks
SET fts = 
    setweight(to_tsvector('italian', COALESCE(materia, '')), 'A') ||
    setweight(to_tsvector('italian', COALESCE(tipo, '')), 'B') ||
    setweight(to_tsvector('italian', COALESCE(content, '')), 'C')
WHERE fts IS NULL;
