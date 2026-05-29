-- ═══════════════════════════════════════════════════════
-- MIGRAZIONE: Scrematura TAR/CdS
--
-- 1. Colonna importance_score per persistere il punteggio euristico
-- 2. Colonna importance_tier per classificazione rapida  
-- 3. Indice FTS (Full-Text Search) su testo_completo
--    per ricerca keyword diretta senza embedding
-- ═══════════════════════════════════════════════════════

-- 1. Colonna importance_score (punteggio euristico del Filtro 2)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'provvedimenti_ga' AND column_name = 'importance_score'
    ) THEN
        ALTER TABLE provvedimenti_ga ADD COLUMN importance_score INTEGER;
    END IF;
END $$;

-- 2. Colonna importance_tier (VIP_CANDIDATA, TIER_2, TIER_3, SCARTO)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'provvedimenti_ga' AND column_name = 'importance_tier'
    ) THEN
        ALTER TABLE provvedimenti_ga ADD COLUMN importance_tier TEXT;
    END IF;
END $$;

-- 3. Indice sulle nuove colonne per query veloci
CREATE INDEX IF NOT EXISTS idx_provvedimenti_ga_importance_score
    ON provvedimenti_ga (importance_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_provvedimenti_ga_importance_tier
    ON provvedimenti_ga (importance_tier);

-- 4. FTS su testo_completo (configurazione 'simple' per match esatto)
--    Nota: generato as STORED per non ricalcolare a ogni query.
--    Il testo medio è ~20-80KB, PostgreSQL gestisce bene il GIN index.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'provvedimenti_ga' AND column_name = 'fts'
    ) THEN
        ALTER TABLE provvedimenti_ga ADD COLUMN fts tsvector;
    END IF;
END $$;

-- Popola la colonna FTS per i record esistenti (batch — può impiegare qualche minuto)
UPDATE provvedimenti_ga
SET fts = to_tsvector('simple', coalesce(testo_completo, ''))
WHERE testo_completo IS NOT NULL AND fts IS NULL;

-- Indice GIN per ricerche full-text veloci
CREATE INDEX IF NOT EXISTS idx_provvedimenti_ga_fts
    ON provvedimenti_ga USING GIN (fts);

-- Trigger per auto-aggiornare FTS su INSERT/UPDATE
CREATE OR REPLACE FUNCTION update_provvedimenti_ga_fts()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.testo_completo IS NOT NULL THEN
        NEW.fts := to_tsvector('simple', NEW.testo_completo);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_provvedimenti_ga_fts ON provvedimenti_ga;

CREATE TRIGGER trg_provvedimenti_ga_fts
    BEFORE INSERT OR UPDATE OF testo_completo
    ON provvedimenti_ga
    FOR EACH ROW
    EXECUTE FUNCTION update_provvedimenti_ga_fts();

-- 5. Indice composto sede + tier per filtrare per sede nella UI
CREATE INDEX IF NOT EXISTS idx_provvedimenti_ga_sede_tier
    ON provvedimenti_ga (sede_slug, importance_tier);
