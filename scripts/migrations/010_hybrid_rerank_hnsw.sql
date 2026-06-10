-- ============================================================
-- Migration 010: re-rank ibrido nel path HNSW + tipi uuid corretti
--
-- NOTA IMPORTANTE: le migration 008 e 009 dichiaravano id/document_id come
-- bigint, ma la tabella rag_chunks usa UUID (vedi 004/006) → CREATE OR REPLACE
-- falliva con 42P13 e quelle versioni NON sono mai andate live.
-- Questa migration: (a) droppa la funzione esistente, (b) la ricrea con i tipi
-- uuid corretti, (c) include TUTTE le ottimizzazioni di 008/009 (probe count,
-- ef_search adattivo, filtro PQM in SQL) più il re-rank ibrido nel path HNSW.
--
-- PRIMA: il ramo HNSW selezionava i top match_count per PURA distanza
-- vettoriale — keyword_score/hybrid_score calcolati ma mai influenti.
-- ORA: pool di match_count*3 candidati per distanza (usa l'indice HNSW),
-- poi re-rank per punteggio ibrido 70% vettore + 30% keyword.
--
-- Da eseguire nel SQL Editor di Supabase.
-- ============================================================

BEGIN;

-- Droppa TUTTE le versioni/overload esistenti della funzione, qualunque firma
-- abbiano (in passato ci sono stati overload duplicati, cfr. 007_fix_overload)
DO $drop$
DECLARE
    fn record;
BEGIN
    FOR fn IN
        SELECT oid::regprocedure AS sig
        FROM pg_proc
        WHERE proname = 'match_documents_hybrid'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('DROP FUNCTION %s', fn.sig);
    END LOOP;
END
$drop$;

CREATE FUNCTION public.match_documents_hybrid(
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

    -- Probe: conta fino a 15000 per decidere se usare la scan sequenziale
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
            SELECT c.id AS cid, c.document_id AS cdoc, c.content AS ccontent,
                c.materia AS cmateria, c.tipo AS ctipo, c.fts AS cfts,
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
        SELECT sp.cid, sp.cdoc, sp.ccontent, sp.cmateria, sp.ctipo,
            d.titolo, sp.sim,
            CASE WHEN ts_query IS NOT NULL AND sp.cfts IS NOT NULL
                THEN ts_rank_cd(sp.cfts, ts_query, 32)::float ELSE 0.0
            END AS keyword_score,
            (0.7 * sp.sim +
             0.3 * CASE WHEN ts_query IS NOT NULL AND sp.cfts IS NOT NULL
                THEN ts_rank_cd(sp.cfts, ts_query, 32)::float ELSE 0.0
             END)::float AS hybrid_score
        FROM small_pool sp
        LEFT JOIN rag_documents d ON d.id = sp.cdoc
        WHERE sp.sim >= match_threshold
        ORDER BY hybrid_score DESC
        LIMIT match_count;
    ELSE
        -- ef_search più alto per ricerche filtrate (post-filter HNSW)
        PERFORM set_config('hnsw.ef_search',
            CASE
                WHEN filter_materia IS NOT NULL THEN '1000'
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

COMMIT;

-- Verifica rapida post-migration (opzionale):
-- SELECT proname, pg_get_function_result(oid) FROM pg_proc WHERE proname = 'match_documents_hybrid';
