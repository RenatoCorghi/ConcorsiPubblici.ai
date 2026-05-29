-- Elimina TUTTE le versioni della funzione
DROP FUNCTION IF EXISTS match_documents_hybrid(vector, text, int, double precision, text, text, int, int);
DROP FUNCTION IF EXISTS match_documents_hybrid(vector, text, int, float, text, text, int, int);
DROP FUNCTION IF EXISTS match_documents_hybrid(vector(768), text, int, double precision, text, text, int, int);
DROP FUNCTION IF EXISTS match_documents_hybrid(vector(768), text, int, float, text, text, int, int);

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
    WITH pre_filtered AS (
        SELECT c.id, c.document_id, c.content, c.materia, c.tipo, c.embedding, c.fts
        FROM rag_chunks c
        WHERE
            (filter_materia IS NULL OR c.materia = filter_materia OR c.materia IS NULL)
            AND (filter_tipo IS NULL OR c.tipo = filter_tipo)
            AND (filter_tier IS NULL OR c.tier = filter_tier)
            AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
    )
    SELECT
        pf.id,
        pf.document_id,
        pf.content,
        pf.materia,
        pf.tipo,
        d.titolo,
        (1 - (pf.embedding <=> query_embedding))::float AS similarity,
        CASE
            WHEN ts_query IS NOT NULL AND pf.fts IS NOT NULL
            THEN ts_rank_cd(pf.fts, ts_query, 32)::float
            ELSE 0.0
        END AS keyword_score,
        (
            0.7 * (1 - (pf.embedding <=> query_embedding))::float +
            0.3 * CASE
                WHEN ts_query IS NOT NULL AND pf.fts IS NOT NULL
                THEN ts_rank_cd(pf.fts, ts_query, 32)::float
                ELSE 0.0
            END
        )::float AS hybrid_score
    FROM pre_filtered pf
    LEFT JOIN rag_documents d ON d.id = pf.document_id
    WHERE (1 - (pf.embedding <=> query_embedding)) >= match_threshold
    ORDER BY hybrid_score DESC
    LIMIT match_count;
END;
$$;
