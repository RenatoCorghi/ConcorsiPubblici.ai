-- ============================================================
-- Migration 010: il path HNSW ora riordina per hybrid_score
--
-- PRIMA: il ramo HNSW selezionava i top match_count per PURA distanza
-- vettoriale (ORDER BY embedding <=> query) — keyword_score e hybrid_score
-- venivano calcolati ma non influenzavano MAI quali righe uscivano.
-- Il 70/30 ibrido era di fatto morto su tutti i pool grandi.
--
-- ORA: si prende un pool di match_count*3 candidati per distanza (usa
-- l'indice HNSW come prima), poi si riordina il pool per punteggio
-- ibrido 70% vettore + 30% keyword. Il segnale keyword (numeri di
-- articolo, latinismi, lessico tecnico esatto) torna a contare.
--
-- Da eseguire nel SQL Editor di Supabase. Idempotente (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.match_documents_hybrid(
    query_embedding vector(768),
    query_text text,
    match_count int DEFAULT 5,
    match_threshold float DEFAULT 0.5,
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

    -- Ottimizzazione: conta fino a un massimo di 15000 per decidere se usare la scan sequenziale
    SELECT count(*) INTO subset_size FROM (
        SELECT 1
        FROM rag_chunks c
        WHERE (filter_materia IS NULL OR c.materia = filter_materia OR c.materia IS NULL)
          AND (filter_tier IS NULL OR c.tier = filter_tier)
          AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
          AND c.embedding IS NOT NULL
        LIMIT 15000
    ) sub;

    use_sequential := (subset_size < 15000);

    IF use_sequential THEN
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
        -- Imposta ef_search più alto per ricerche filtrate per garantire esplorazione
        PERFORM set_config('hnsw.ef_search',
            CASE
                WHEN filter_materia IS NOT NULL THEN '1000'
                WHEN subset_size < 15000 THEN '400'
                ELSE '150'
            END, true);

        -- Pool di candidati per distanza vettoriale (sfrutta l'indice HNSW),
        -- poi re-rank del pool per punteggio ibrido 70/30
        RETURN QUERY
        WITH candidates AS (
            SELECT c.id AS cid, c.document_id AS cdoc, c.content AS ccontent,
                c.materia AS cmateria, c.tipo AS ctipo, c.fts AS cfts,
                (1 - (c.embedding <=> query_embedding))::float AS sim
            FROM rag_chunks c
            WHERE (filter_materia IS NULL OR c.materia = filter_materia OR c.materia IS NULL)
              AND (filter_tipo IS NULL OR c.tipo = filter_tipo)
              AND (filter_tier IS NULL OR c.tier = filter_tier)
              AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
              AND NOT (length(c.content) < 600 AND (
                  c.content ILIKE 'P.Q.M.%' OR c.content ILIKE 'P. Q. M.%'
                  OR c.content ILIKE '%P.Q.M.%dichiara%' OR c.content ILIKE '%P.Q.M.%rigetta%'
                  OR c.content ILIKE '%P.Q.M.%accoglie%' OR c.content ILIKE '%P.Q.M.%cassa%'
              ))
            ORDER BY c.embedding <=> query_embedding
            LIMIT match_count * 3
        )
        SELECT cand.cid, cand.cdoc, cand.ccontent, cand.cmateria, cand.ctipo,
            d.titolo, cand.sim,
            CASE WHEN ts_query IS NOT NULL AND cand.cfts IS NOT NULL
                THEN ts_rank_cd(cand.cfts, ts_query, 32)::float ELSE 0.0
            END AS keyword_score,
            (0.7 * cand.sim +
             0.3 * CASE WHEN ts_query IS NOT NULL AND cand.cfts IS NOT NULL
                THEN ts_rank_cd(cand.cfts, ts_query, 32)::float ELSE 0.0
             END)::float AS hybrid_score
        FROM candidates cand
        LEFT JOIN rag_documents d ON d.id = cand.cdoc
        WHERE cand.sim >= match_threshold
        ORDER BY hybrid_score DESC
        LIMIT match_count;
    END IF;
END;
$$;
