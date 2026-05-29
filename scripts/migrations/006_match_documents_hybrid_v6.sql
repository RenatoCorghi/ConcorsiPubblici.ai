-- Migration 006: Rewrite match_documents_hybrid for performance
-- Problema: la versione precedente usava un CTE pre_filtered che materializzava
-- tutte le righe, causando sequential scan su 300K+ chunk (19+ secondi).
-- Soluzione: strategia ibrida basata su dimensione subset
--   - Subset < 15K chunk: scan sequenziale diretto (preciso, ~100ms)
--   - Subset >= 15K chunk: HNSW index scan con ef_search adattivo (~1-5s)
-- Include filtro PQM a livello DB per escludere dispositivi inutili.

CREATE OR REPLACE FUNCTION match_documents_hybrid(
    query_embedding vector(768),
    query_text text DEFAULT '',
    match_count int DEFAULT 5,
    match_threshold float DEFAULT 0.5,
    filter_materia text DEFAULT NULL,
    filter_tipo text DEFAULT NULL,
    filter_tier int DEFAULT NULL,
    filter_anno_min int DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    document_id uuid,
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
    subset_size int;
    use_sequential boolean := false;
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

    -- Stima dimensione subset (usa indici materia+tier, ~1ms)
    SELECT count(*) INTO subset_size
    FROM rag_chunks c
    WHERE (filter_materia IS NULL OR c.materia = filter_materia OR c.materia IS NULL)
      AND (filter_tier IS NULL OR c.tier = filter_tier)
      AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
      AND c.embedding IS NOT NULL;

    -- Soglia: < 15K → scan diretto (preciso), >= 15K → HNSW (veloce)
    use_sequential := (subset_size < 15000);

    IF use_sequential THEN
        -- STRATEGIA A: Scan diretto su subset piccolo
        RETURN QUERY
        WITH small_pool AS (
            SELECT c.id, c.document_id, c.content, c.materia, c.tipo, c.fts,
                (1 - (c.embedding <=> query_embedding))::float AS sim
            FROM rag_chunks c
            WHERE (filter_materia IS NULL OR c.materia = filter_materia OR c.materia IS NULL)
              AND (filter_tipo IS NULL OR c.tipo = filter_tipo)
              AND (filter_tier IS NULL OR c.tier = filter_tier)
              AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
              AND c.embedding IS NOT NULL
              AND NOT (length(c.content) < 600 AND (
                  c.content ILIKE 'P.Q.M.%' OR c.content ILIKE 'P. Q. M.%'
                  OR c.content ILIKE '%P.Q.M.%dichiara%' OR c.content ILIKE '%P.Q.M.%rigetta%'
                  OR c.content ILIKE '%P.Q.M.%accoglie%' OR c.content ILIKE '%P.Q.M.%cassa%'
              ))
        )
        SELECT sp.id, sp.document_id, sp.content, sp.materia, sp.tipo,
            d.titolo, sp.sim,
            CASE WHEN ts_query IS NOT NULL AND sp.fts IS NOT NULL
                THEN ts_rank_cd(sp.fts, ts_query, 32)::float ELSE 0.0
            END AS keyword_score,
            (0.7 * sp.sim +
             0.3 * CASE WHEN ts_query IS NOT NULL AND sp.fts IS NOT NULL
                THEN ts_rank_cd(sp.fts, ts_query, 32)::float ELSE 0.0
             END)::float AS hybrid_score
        FROM small_pool sp
        LEFT JOIN rag_documents d ON d.id = sp.document_id
        WHERE sp.sim >= match_threshold
        ORDER BY hybrid_score DESC
        LIMIT match_count;
    ELSE
        -- STRATEGIA B: HNSW index scan con ef_search adattivo
        PERFORM set_config('hnsw.ef_search', 
            CASE 
                WHEN subset_size < 50000 THEN '400'
                WHEN subset_size < 150000 THEN '200'
                ELSE '100'
            END, true);
        
        RETURN QUERY
        SELECT 
            c.id, c.document_id, c.content, c.materia, c.tipo,
            d.titolo,
            (1 - (c.embedding <=> query_embedding))::float AS similarity,
            CASE WHEN ts_query IS NOT NULL AND c.fts IS NOT NULL
                THEN ts_rank_cd(c.fts, ts_query, 32)::float ELSE 0.0
            END AS keyword_score,
            (0.7 * (1 - (c.embedding <=> query_embedding))::float +
             0.3 * CASE WHEN ts_query IS NOT NULL AND c.fts IS NOT NULL
                THEN ts_rank_cd(c.fts, ts_query, 32)::float ELSE 0.0
             END)::float AS hybrid_score
        FROM rag_chunks c
        LEFT JOIN rag_documents d ON d.id = c.document_id
        WHERE (filter_materia IS NULL OR c.materia = filter_materia OR c.materia IS NULL)
          AND (filter_tipo IS NULL OR c.tipo = filter_tipo)
          AND (filter_tier IS NULL OR c.tier = filter_tier)
          AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
          AND (1 - (c.embedding <=> query_embedding))::float >= match_threshold
          AND NOT (length(c.content) < 600 AND (
              c.content ILIKE 'P.Q.M.%' OR c.content ILIKE 'P. Q. M.%'
              OR c.content ILIKE '%P.Q.M.%dichiara%' OR c.content ILIKE '%P.Q.M.%rigetta%'
              OR c.content ILIKE '%P.Q.M.%accoglie%' OR c.content ILIKE '%P.Q.M.%cassa%'
          ))
        ORDER BY c.embedding <=> query_embedding
        LIMIT match_count;
    END IF;
END;
$$;
