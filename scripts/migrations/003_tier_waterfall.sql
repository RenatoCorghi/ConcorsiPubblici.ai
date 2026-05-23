-- ============================================================
-- MIGRAZIONE: Tier 2 — Colonne tier e anno per Waterfall Retrieval
-- ============================================================
-- Data: 2026-05-23
-- Autore: Antigravity per ConcorsiPubblici.ai
--
-- Aggiunge:
-- 1. Colonna 'tier' a rag_chunks (1 = VIP/Gold, 2 = Silver/Sez. Semplici)
-- 2. Colonna 'anno' a rag_chunks per filtro temporale
-- 3. Indici per query filtrate
-- 4. Aggiornamento RPC match_documents_hybrid con nuovi parametri
-- ============================================================

-- ============================================================
-- STEP 1: Colonne tier e anno
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'rag_chunks' AND column_name = 'tier'
    ) THEN
        ALTER TABLE rag_chunks ADD COLUMN tier INTEGER DEFAULT 1;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'rag_chunks' AND column_name = 'anno'
    ) THEN
        ALTER TABLE rag_chunks ADD COLUMN anno INTEGER;
    END IF;
END $$;

-- Tutti i documenti esistenti sono tier 1 (VIP/Gold)
UPDATE rag_chunks SET tier = 1 WHERE tier IS NULL;

-- ============================================================
-- STEP 2: Indici per filtri rapidi
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tier ON rag_chunks (tier);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_anno ON rag_chunks (anno);
-- Indice composito per il Waterfall Retrieval (tier + similarity)
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tier_tipo ON rag_chunks (tier, tipo);

-- ============================================================
-- STEP 3: RPC match_documents_hybrid V2 — con filtri tier e anno
-- ============================================================
-- Nuovi parametri opzionali:
--   filter_tier       int    Filtro per tier (1=VIP, 2=Silver). NULL = tutti
--   filter_anno_min   int    Filtro anno minimo (es. 2024). NULL = tutti

CREATE OR REPLACE FUNCTION match_documents_hybrid(
    query_embedding vector(768),
    query_text text DEFAULT '',
    match_count int DEFAULT 10,
    match_threshold float DEFAULT 0.3,
    filter_materia text DEFAULT NULL,
    filter_tipo text DEFAULT NULL,
    filter_tier int DEFAULT NULL,
    filter_anno_min int DEFAULT NULL
)
RETURNS TABLE (
    id bigint,
    document_id bigint,
    content text,
    materia text,
    tipo text,
    titolo text,
    similarity float,
    keyword_score float,
    hybrid_score float
)
LANGUAGE plpgsql
AS $$
DECLARE
    ts_query tsquery;
BEGIN
    IF query_text IS NOT NULL AND query_text <> '' THEN
        BEGIN
            ts_query := websearch_to_tsquery('italian', query_text);
        EXCEPTION WHEN OTHERS THEN
            ts_query := NULL;
        END;
    ELSE
        ts_query := NULL;
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.document_id,
        c.content,
        c.materia,
        c.tipo,
        d.titolo,
        (1 - (c.embedding <=> query_embedding))::float AS similarity,
        CASE
            WHEN ts_query IS NOT NULL AND c.fts IS NOT NULL
            THEN ts_rank_cd(c.fts, ts_query, 32)::float
            ELSE 0.0
        END AS keyword_score,
        (
            0.7 * (1 - (c.embedding <=> query_embedding))::float +
            0.3 * CASE
                WHEN ts_query IS NOT NULL AND c.fts IS NOT NULL
                THEN ts_rank_cd(c.fts, ts_query, 32)::float
                ELSE 0.0
            END
        )::float AS hybrid_score
    FROM rag_chunks c
    LEFT JOIN rag_documents d ON d.id = c.document_id
    WHERE
        (1 - (c.embedding <=> query_embedding)) >= match_threshold
        AND (filter_materia IS NULL OR c.materia = filter_materia)
        AND (filter_tipo IS NULL OR c.tipo = filter_tipo)
        AND (filter_tier IS NULL OR c.tier = filter_tier)
        AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
    ORDER BY hybrid_score DESC
    LIMIT match_count;
END;
$$;

-- ============================================================
-- VERIFICA
-- ============================================================
-- Per testare i nuovi filtri:
-- SELECT * FROM match_documents_hybrid(
--     query_embedding := '<vettore>',
--     query_text := 'responsabilità medica',
--     match_count := 5,
--     filter_tier := 1
-- );
