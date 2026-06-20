-- ============================================================
-- Migration 011: famiglia materie in SQL + stats table + iterative_scan
--
-- Tre ottimizzazioni (secondo giro RAG):
--
-- (1) COLONNA materia_family (generata) + filtro famiglia nella RPC.
--     PRIMA: filter_materia='Diritto Civile' escludeva a livello SQL i chunk
--     etichettati 'Diritto Commerciale', 'Diritto del Lavoro', 'Giurisprudenza
--     Civile' ecc. — il matching soft esisteva solo in JS, ma operava su
--     risultati già filtrati via SQL, quindi non recuperava nulla.
--     ORA: il filtro SQL accetta tutta la famiglia (civile ≈ 11.600 chunk
--     invece dei soli match esatti). Specchio della funzione materiaFamily()
--     in api/proxy.js — se cambi una, cambia anche l'altra.
--
-- (2) TABELLA rag_family_stats mantenuta da trigger.
--     PRIMA: ogni chiamata RPC faceva un count(*) fino a 15.000 righe heap
--     solo per decidere sequential vs HNSW. Con multi-query (fino a 8 RPC
--     parallele) erano fino a 120k letture di righe per richiesta utente.
--     ORA: 1 lettura su una tabella di ~6 righe. Probe live solo come
--     fallback per filtri rari (tier/anno) o materie non mappate.
--
-- (3) hnsw.iterative_scan = relaxed_order nel path HNSW (pgvector >= 0.8).
--     Evita che il post-filtering affami i risultati quando una famiglia
--     supera la soglia dei 15.000 chunk (amministrativo è a ~14.800 ed è
--     questione di settimane). Con guardia EXCEPTION: su pgvector più
--     vecchi il set_config fallisce in silenzio e si procede come prima.
--
-- Da eseguire nel SQL Editor di Supabase (tab nuovo, file intero).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Funzione famiglia materie (IMMUTABLE: usabile in colonna generata)
--    Specchio esatto di materiaFamily() in api/proxy.js, stesso ordine
--    dei rami (civile prima di costituzionale: 'Diritto Civile e
--    Costituzionale' → 'civile', come in JS).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rag_materia_family(m text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions
AS $func$
    SELECT CASE
        WHEN m IS NULL OR m = 'Tutte le materie' THEN NULL
        WHEN lower(m) LIKE '%civile%'
          OR lower(m) LIKE '%lavoro%'
          OR lower(m) LIKE '%commerciale%' THEN 'civile'
        WHEN lower(m) LIKE '%penale%' THEN 'penale'
        WHEN lower(m) LIKE '%amministrativ%' THEN 'amministrativo'
        WHEN lower(m) LIKE '%tributar%' THEN 'tributario'
        WHEN lower(m) LIKE '%costituzional%' THEN 'costituzionale'
        WHEN lower(m) LIKE '%massimario%' THEN 'civile'
        ELSE NULL
    END
$func$;

-- ------------------------------------------------------------
-- 2. Colonna generata + indice
--    (ADD COLUMN GENERATED STORED riscrive la tabella: su 35k righe
--    sono pochi secondi)
-- ------------------------------------------------------------
ALTER TABLE rag_chunks
    ADD COLUMN IF NOT EXISTS materia_family text
    GENERATED ALWAYS AS (public.rag_materia_family(materia)) STORED;

CREATE INDEX IF NOT EXISTS idx_rag_chunks_materia_family
    ON rag_chunks (materia_family);

-- ------------------------------------------------------------
-- 3. Tabella stats + trigger di mantenimento + backfill
--    Chiavi: una riga per famiglia, '__none__' per i chunk con materia
--    NULL o non mappata, '__all__' per il totale corpus.
--    Conta SOLO chunk con embedding (come il probe che sostituisce).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_family_stats (
    family text PRIMARY KEY,
    chunk_count bigint NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.rag_family_stats_maintain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $trig$
DECLARE
    old_fam text;
    new_fam text;
BEGIN
    -- I trigger AFTER vedono le colonne generate già calcolate
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.embedding IS NOT NULL THEN
        old_fam := COALESCE(OLD.materia_family, '__none__');
        UPDATE rag_family_stats
            SET chunk_count = chunk_count - 1
            WHERE family IN (old_fam, '__all__');
    END IF;

    IF (TG_OP = 'UPDATE' OR TG_OP = 'INSERT') AND NEW.embedding IS NOT NULL THEN
        new_fam := COALESCE(NEW.materia_family, '__none__');
        INSERT INTO rag_family_stats (family, chunk_count)
            VALUES (new_fam, 1), ('__all__', 1)
        ON CONFLICT (family)
            DO UPDATE SET chunk_count = rag_family_stats.chunk_count + 1;
    END IF;

    RETURN NULL;
END;
$trig$;

DROP TRIGGER IF EXISTS trg_rag_family_stats ON rag_chunks;
CREATE TRIGGER trg_rag_family_stats
    AFTER INSERT OR DELETE OR UPDATE OF materia, embedding ON rag_chunks
    FOR EACH ROW
    EXECUTE FUNCTION public.rag_family_stats_maintain();

-- Backfill iniziale (idempotente: ricalcola da zero)
DELETE FROM rag_family_stats;

INSERT INTO rag_family_stats (family, chunk_count)
SELECT COALESCE(materia_family, '__none__'), count(*)
FROM rag_chunks
WHERE embedding IS NOT NULL
GROUP BY 1;

INSERT INTO rag_family_stats (family, chunk_count)
SELECT '__all__', count(*)
FROM rag_chunks
WHERE embedding IS NOT NULL;

-- ------------------------------------------------------------
-- 4. match_documents_hybrid aggiornata
--    Stessa firma e stesso tipo di ritorno della 010 (uuid), ma per
--    sicurezza droppiamo comunque ogni overload esistente prima della
--    CREATE (stesso pattern della 010, che ha risolto il 42P13).
-- ------------------------------------------------------------
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
SET search_path = public, extensions
AS $$
DECLARE
    ts_query tsquery;
    subset_size int;
    use_sequential boolean := false;
    fam text;
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

    fam := public.rag_materia_family(filter_materia);

    -- Probe via stats table: 1 lettura invece di un count fino a 15000
    -- righe heap. Approssimazione accettabile: serve solo a scegliere il
    -- path (sequential vs HNSW), non dev'essere esatto al chunk.
    IF filter_tier IS NULL AND filter_anno_min IS NULL THEN
        IF filter_materia IS NULL THEN
            SELECT s.chunk_count INTO subset_size
            FROM rag_family_stats s WHERE s.family = '__all__';
        ELSIF fam IS NOT NULL THEN
            -- famiglia richiesta + chunk senza materia (inclusi dal filtro)
            SELECT COALESCE(SUM(s.chunk_count), 0)::int INTO subset_size
            FROM rag_family_stats s WHERE s.family IN (fam, '__none__');
        END IF;
        -- 0 righe in stats (tabella non backfillata?) → forza probe live
        IF subset_size = 0 THEN subset_size := NULL; END IF;
    END IF;

    -- Fallback: probe live per filtri rari (tier/anno), materie non
    -- mappate o stats vuote
    IF subset_size IS NULL THEN
        SELECT count(*) INTO subset_size FROM (
            SELECT 1
            FROM rag_chunks c
            WHERE (filter_materia IS NULL OR c.materia IS NULL
                   OR c.materia = filter_materia
                   OR (fam IS NOT NULL AND c.materia_family = fam))
              AND (filter_tier IS NULL OR c.tier = filter_tier)
              AND (filter_anno_min IS NULL OR c.anno >= filter_anno_min)
              AND c.embedding IS NOT NULL
            LIMIT 15000
        ) sub;
    END IF;

    use_sequential := (subset_size < 15000);

    IF use_sequential THEN
        RETURN QUERY
        WITH small_pool AS (
            SELECT c.id AS cid, c.document_id AS cdoc, c.content AS ccontent,
                c.materia AS cmateria, c.tipo AS ctipo, c.fts AS cfts,
                (1 - (c.embedding <=> query_embedding))::float AS sim
            FROM rag_chunks c
            WHERE (filter_materia IS NULL OR c.materia IS NULL
                   OR c.materia = filter_materia
                   OR (fam IS NOT NULL AND c.materia_family = fam))
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

        -- Scan iterativo (pgvector >= 0.8): se il post-filtering scarta
        -- troppi candidati, l'indice continua a scandire invece di
        -- restituire un set affamato. Su pgvector più vecchi il parametro
        -- non esiste: la guardia ignora l'errore e si procede come prima.
        BEGIN
            PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        -- Pool di candidati per distanza vettoriale (sfrutta l'indice HNSW),
        -- poi re-rank del pool per punteggio ibrido 70/30
        RETURN QUERY
        WITH candidates AS (
            SELECT c.id AS cid, c.document_id AS cdoc, c.content AS ccontent,
                c.materia AS cmateria, c.tipo AS ctipo, c.fts AS cfts,
                (1 - (c.embedding <=> query_embedding))::float AS sim
            FROM rag_chunks c
            WHERE (filter_materia IS NULL OR c.materia IS NULL
                   OR c.materia = filter_materia
                   OR (fam IS NOT NULL AND c.materia_family = fam))
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

-- Verifiche rapide post-migration (opzionali, da eseguire a parte):
-- SELECT family, chunk_count FROM rag_family_stats ORDER BY chunk_count DESC;
-- SELECT materia_family, count(*) FROM rag_chunks GROUP BY 1 ORDER BY 2 DESC;
-- SELECT extversion FROM pg_extension WHERE extname = 'vector';  -- >= 0.8.0 per iterative_scan
