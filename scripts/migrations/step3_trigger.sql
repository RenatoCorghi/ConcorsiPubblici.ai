-- ============================================================
-- BLOCCO 3/4 — Trigger aggiornamento automatico fts
-- Incolla ed esegui dopo il Blocco 2.
-- ============================================================

CREATE OR REPLACE FUNCTION update_rag_chunks_fts()
RETURNS trigger AS $$
BEGIN
    NEW.fts := 
        setweight(to_tsvector('italian', COALESCE(NEW.materia, '')), 'A') ||
        setweight(to_tsvector('italian', COALESCE(NEW.tipo, '')), 'B') ||
        setweight(to_tsvector('italian', COALESCE(NEW.content, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rag_chunks_fts ON rag_chunks;

CREATE TRIGGER trg_rag_chunks_fts
    BEFORE INSERT OR UPDATE OF content, materia, tipo
    ON rag_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_rag_chunks_fts();
