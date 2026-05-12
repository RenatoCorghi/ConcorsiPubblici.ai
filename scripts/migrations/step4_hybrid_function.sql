-- ============================================================
-- BLOCCO 4/4 — Funzione RPC match_documents_hybrid
-- Incolla ed esegui dopo il Blocco 3.
-- Questo è il cuore della Hybrid Search.
-- ============================================================

CREATE OR REPLACE FUNCTION match_documents_hybrid(
    query_embedding vector(768),
    query_text text DEFAULT '',
    match_count int DEFAULT 10,
    match_threshold float DEFAULT 0.3,
    filter_materia text DEFAULT NULL,
    filter_tipo text DEFAULT NULL
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
    ORDER BY hybrid_score DESC
    LIMIT match_count;
END;
$$;

-- Test rapido (opzionale, per verificare che la funzione esista):
-- SELECT routine_name FROM information_schema.routines 
-- WHERE routine_name = 'match_documents_hybrid';
