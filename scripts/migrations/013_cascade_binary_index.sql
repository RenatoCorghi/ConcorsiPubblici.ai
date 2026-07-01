-- ============================================================
-- Migration 013 — Cascata di quantizzazione binaria stratificata
--                 per autorità della fonte
--                 ("Authority-Stratified Quantization Cascade")
--
-- CONTESTO TECNICO (misurato in produzione il 2026-07-01):
--   * pgvector 0.8.0 su Postgres 17.6, 35.180 chunk vector(768) float32
--     (~3 KB/vettore, TOASTed: ogni distanza esatta paga un detoast).
--   * Indici HNSW float: ~273 MB contro shared_buffers = 256 MB → il grafo
--     float NON sta in cache.
--   * MISURATO (scripts/bench_cascade.mjs): il path sequenziale della hybrid
--     live su subset appena sotto il vecchio gate di 15.000 (Diritto
--     Amministrativo = 14.741 chunk) costa 6-7 SECONDI a query.
--   * MISURATO (diagnosi Hamming rank): i top-8 veri stanno quasi tutti nei
--     primi 300 del ranking di Hamming del subset, MA il grafo HNSW binario
--     post-filtrato li perde: le distanze di Hamming vivono in una banda
--     strettissima (194-273 su 768) piena di pari merito e il greedy del
--     grafo naviga male. Da qui la scelta della SCANSIONE PIATTA ESATTA.
--
-- ARCHITETTURA (L0 flat sidecar → rescore stratificato):
--   SIDECAR rag_chunks_bq: una riga per chunk con lo sketch binario
--     (binary_quantize → bit(768) = 96 B, -97% sul float32) + i soli metadati
--     necessari ai filtri (materia, famiglia, tipo, tier, anno, is_pqm,
--     arank). ~5 MB per 35K righe: risiede stabilmente in shared_buffers.
--     Mantenuta da trigger su rag_chunks; delete via FK ON DELETE CASCADE.
--     Vantaggio chiave: il coarse stage non tocca MAI la heap principale
--     (782 MB) né i vettori float TOASTed.
--   STADIO 1 (coarse, ESATTO nella metrica quantizzata): scan piatta della
--     sidecar con distanza di Hamming (popcount) + filtri → top coarse_k.
--     Deterministico: niente pathologie di navigazione del grafo.
--   STADIO 2 (rescore esatto float32, stratificato per autorità):
--     - classe GOLD (codici/T.U., massimari, nomofilachia SS.UU., dottrina
--       VIP): rescore esatto SEMPRE, per ogni gold presente nel pool;
--     - classe SILVER (resto): rescore solo per le migliori rescore_budget
--       per distanza di Hamming.
--     Costo esatto massimo: coarse_k detoast (~3 KB l'uno), contro le
--     14.700+ righe del path sequenziale.
--   Punteggio finale identico alla hybrid live: 0.7*coseno + 0.3*ts_rank_cd.
--   Il path sequenziale float resta SOLO per subset < seq_gate (default
--   2000, dove il full scan esatto costa <100ms e dà recall perfetto).
--
--   NOTA SCALA: a >200K chunk la scan piatta della sidecar cresce linearmente
--   (~40 MB/300K); a quel punto si aggiunge un HNSW(bq) sulla sidecar come
--   ulteriore livello. L'indice HNSW binario creato dalla v1 di questa
--   migration (idx_rag_chunks_embedding_bq) è stato DROPPATO: la scan piatta
--   lo batteva sia in recall (92,7% vs 85,4%) sia in latenza (30ms vs 36ms).
--
-- SEMANTICA FILTRO MATERIA: identica alla hybrid live (migration 011) —
-- match esatto O per famiglia via rag_materia_family(), probe O(1) via
-- rag_family_stats con fallback al probe live.
--
-- match_documents_cascade è DROP-IN rispetto a match_documents_hybrid: stessa
-- firma base (+ coarse_k/rescore_budget/seq_gate opzionali), stessa shape di
-- ritorno. Il proxy la attiva con env RAG_CASCADE=1 e fa fallback automatico.
-- match_documents_exact è SOLO per benchmark (ground truth a scan completo).
--
-- Eseguire con: node scripts/migrations/run_migration_013.mjs
-- oppure incollando l'intero file nell'SQL Editor di Supabase.
-- ============================================================

-- ===SPLIT===

-- SIDECAR: sketch binari + metadati di filtro, RAM-resident (~5 MB / 35K righe)
CREATE TABLE IF NOT EXISTS rag_chunks_bq (
    id uuid PRIMARY KEY REFERENCES rag_chunks(id) ON DELETE CASCADE,
    bq bit(768) NOT NULL,
    materia text,
    materia_family text,
    tipo text,
    tier int,
    anno int,
    arank smallint NOT NULL DEFAULT 2,
    is_pqm boolean NOT NULL DEFAULT false
);

-- ===SPLIT===

-- Trigger di manutenzione: ogni insert/update su rag_chunks aggiorna lo
-- sketch. AFTER trigger: legge anche la colonna generata materia_family.
CREATE OR REPLACE FUNCTION public.rag_chunks_bq_maintain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    IF NEW.embedding IS NULL THEN
        DELETE FROM rag_chunks_bq b WHERE b.id = NEW.id;
        RETURN NEW;
    END IF;
    INSERT INTO rag_chunks_bq (id, bq, materia, materia_family, tipo, tier, anno, arank, is_pqm)
    VALUES (
        NEW.id,
        binary_quantize(NEW.embedding)::bit(768),
        NEW.materia,
        NEW.materia_family,
        NEW.tipo,
        NEW.tier,
        NEW.anno,
        CASE WHEN NEW.tipo IN (
            'codice', 'massimario_cassazione', 'nomofilachia_ssuu',
            'sentenza_ssuu_vip', 'sentenza_ssuu', 'teoria_massimario'
        ) THEN 1 ELSE 2 END,
        (length(NEW.content) < 600 AND (
            NEW.content ILIKE 'P.Q.M.%' OR NEW.content ILIKE 'P. Q. M.%'
            OR NEW.content ILIKE '%P.Q.M.%dichiara%' OR NEW.content ILIKE '%P.Q.M.%rigetta%'
            OR NEW.content ILIKE '%P.Q.M.%accoglie%' OR NEW.content ILIKE '%P.Q.M.%cassa%'
        ))
    )
    ON CONFLICT (id) DO UPDATE SET
        bq = EXCLUDED.bq,
        materia = EXCLUDED.materia,
        materia_family = EXCLUDED.materia_family,
        tipo = EXCLUDED.tipo,
        tier = EXCLUDED.tier,
        anno = EXCLUDED.anno,
        arank = EXCLUDED.arank,
        is_pqm = EXCLUDED.is_pqm;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rag_chunks_bq ON rag_chunks;
CREATE TRIGGER trg_rag_chunks_bq
    AFTER INSERT OR UPDATE OF embedding, materia, tipo, tier, anno, content
    ON rag_chunks
    FOR EACH ROW
    EXECUTE FUNCTION public.rag_chunks_bq_maintain();

-- ===SPLIT===

-- Backfill (idempotente): un solo passaggio di detoast sull'intero corpus
INSERT INTO rag_chunks_bq (id, bq, materia, materia_family, tipo, tier, anno, arank, is_pqm)
SELECT
    c.id,
    binary_quantize(c.embedding)::bit(768),
    c.materia,
    c.materia_family,
    c.tipo,
    c.tier,
    c.anno,
    CASE WHEN c.tipo IN (
        'codice', 'massimario_cassazione', 'nomofilachia_ssuu',
        'sentenza_ssuu_vip', 'sentenza_ssuu', 'teoria_massimario'
    ) THEN 1 ELSE 2 END,
    (length(c.content) < 600 AND (
        c.content ILIKE 'P.Q.M.%' OR c.content ILIKE 'P. Q. M.%'
        OR c.content ILIKE '%P.Q.M.%dichiara%' OR c.content ILIKE '%P.Q.M.%rigetta%'
        OR c.content ILIKE '%P.Q.M.%accoglie%' OR c.content ILIKE '%P.Q.M.%cassa%'
    ))
FROM rag_chunks c
WHERE c.embedding IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
    bq = EXCLUDED.bq,
    materia = EXCLUDED.materia,
    materia_family = EXCLUDED.materia_family,
    tipo = EXCLUDED.tipo,
    tier = EXCLUDED.tier,
    anno = EXCLUDED.anno,
    arank = EXCLUDED.arank,
    is_pqm = EXCLUDED.is_pqm;

-- ===SPLIT===

ANALYZE rag_chunks_bq;

-- ===SPLIT===

-- Droppa eventuali versioni/overload precedenti (lezione imparata con la
-- hybrid: CREATE OR REPLACE fallisce con 42P13 se cambia la firma).
DO $drop$
DECLARE
    fn record;
BEGIN
    FOR fn IN
        SELECT oid::regprocedure AS sig
        FROM pg_proc
        WHERE proname IN ('match_documents_cascade', 'match_documents_exact')
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('DROP FUNCTION %s', fn.sig);
    END LOOP;
END
$drop$;

CREATE FUNCTION public.match_documents_cascade(
    query_embedding vector(768),
    query_text text,
    match_count int DEFAULT 5,
    match_threshold float DEFAULT 0.5,
    filter_materia text DEFAULT NULL,
    filter_tipo text DEFAULT NULL,
    filter_tier int DEFAULT NULL,
    filter_anno_min int DEFAULT NULL,
    coarse_k int DEFAULT 600,
    rescore_budget int DEFAULT 120,
    seq_gate int DEFAULT 2000
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
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    ts_query tsquery;
    subset_size int;
    fam text;
    bqv bit(768);
BEGIN
    bqv := binary_quantize(query_embedding)::bit(768);

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

    -- Probe O(1) via stats table (come hybrid live/migration 011),
    -- fallback al probe live per filtri rari o stats vuote
    IF filter_tier IS NULL AND filter_anno_min IS NULL THEN
        IF filter_materia IS NULL THEN
            SELECT s.chunk_count INTO subset_size
            FROM rag_family_stats s WHERE s.family = '__all__';
        ELSIF fam IS NOT NULL THEN
            SELECT COALESCE(SUM(s.chunk_count), 0)::int INTO subset_size
            FROM rag_family_stats s WHERE s.family IN (fam, '__none__');
        END IF;
        IF subset_size = 0 THEN subset_size := NULL; END IF;
    END IF;

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
            LIMIT seq_gate
        ) sub;
    END IF;

    IF subset_size < seq_gate THEN
        -- PATH ESATTO float solo per subset davvero piccoli (<seq_gate):
        -- lì il full scan costa <100ms e dà recall perfetto. NB: il vecchio
        -- gate a 15.000 lasciava Diritto Amministrativo (14.741 chunk) su
        -- questo path → 6-7s/query.
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
        -- STADIO 1: scan piatta ESATTA della sidecar (Hamming su 96 B/riga,
        -- interamente in cache, zero accessi alla heap principale).
        RETURN QUERY
        WITH coarse AS (
            SELECT b.id AS cid, (b.bq <~> bqv) AS ham, b.arank
            FROM rag_chunks_bq b
            WHERE (filter_materia IS NULL OR b.materia IS NULL
                   OR b.materia = filter_materia
                   OR (fam IS NOT NULL AND b.materia_family = fam))
              AND (filter_tipo IS NULL OR b.tipo = filter_tipo)
              AND (filter_tier IS NULL OR b.tier = filter_tier)
              AND (filter_anno_min IS NULL OR b.anno >= filter_anno_min)
              AND NOT b.is_pqm
            ORDER BY b.bq <~> bqv
            LIMIT coarse_k
        ),
        -- STADIO 2: stratificazione per autorità — le fonti gold del pool
        -- passano TUTTE al rescore esatto, le silver solo entro il budget.
        strata AS (
            SELECT co.cid FROM coarse co WHERE co.arank = 1
            UNION
            SELECT s.cid FROM (
                SELECT co2.cid FROM coarse co2
                WHERE co2.arank = 2
                ORDER BY co2.ham
                LIMIT rescore_budget
            ) s
        ),
        rescored AS (
            SELECT c.id AS cid, c.document_id AS cdoc, c.content AS ccontent,
                c.materia AS cmateria, c.tipo AS ctipo, c.fts AS cfts,
                (1 - (c.embedding <=> query_embedding))::float AS sim
            FROM rag_chunks c
            JOIN strata st ON st.cid = c.id
        )
        SELECT r.cid, r.cdoc, r.ccontent, r.cmateria, r.ctipo,
            d.titolo, r.sim,
            CASE WHEN ts_query IS NOT NULL AND r.cfts IS NOT NULL
                THEN ts_rank_cd(r.cfts, ts_query, 32)::float ELSE 0.0
            END AS keyword_score,
            (0.7 * r.sim +
             0.3 * CASE WHEN ts_query IS NOT NULL AND r.cfts IS NOT NULL
                THEN ts_rank_cd(r.cfts, ts_query, 32)::float ELSE 0.0
             END)::float AS hybrid_score
        FROM rescored r
        LEFT JOIN rag_documents d ON d.id = r.cdoc
        WHERE r.sim >= match_threshold
        ORDER BY hybrid_score DESC
        LIMIT match_count;
    END IF;
END;
$$;

-- ===SPLIT===

-- SOLO BENCHMARK: stessa formula ibrida e stessa semantica di filtro della
-- RPC live, ma a scan completo (nessun indice ANN utilizzabile: l'ordinamento
-- è per hybrid_score calcolato). Ground truth per il recall di hybrid/cascade.
CREATE FUNCTION public.match_documents_exact(
    query_embedding vector(768),
    query_text text,
    match_count int DEFAULT 5,
    match_threshold float DEFAULT 0.5,
    filter_materia text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    tipo text,
    similarity float,
    hybrid_score float
)
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    ts_query tsquery;
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

    RETURN QUERY
    WITH full_pool AS (
        SELECT c.id AS cid, c.tipo AS ctipo, c.fts AS cfts,
            (1 - (c.embedding <=> query_embedding))::float AS sim
        FROM rag_chunks c
        WHERE (filter_materia IS NULL OR c.materia IS NULL
               OR c.materia = filter_materia
               OR (fam IS NOT NULL AND c.materia_family = fam))
          AND c.embedding IS NOT NULL
          AND NOT (length(c.content) < 600 AND (
              c.content ILIKE 'P.Q.M.%' OR c.content ILIKE 'P. Q. M.%'
              OR c.content ILIKE '%P.Q.M.%dichiara%' OR c.content ILIKE '%P.Q.M.%rigetta%'
              OR c.content ILIKE '%P.Q.M.%accoglie%' OR c.content ILIKE '%P.Q.M.%cassa%'
          ))
    )
    SELECT fp.cid, fp.ctipo, fp.sim,
        (0.7 * fp.sim +
         0.3 * CASE WHEN ts_query IS NOT NULL AND fp.cfts IS NOT NULL
            THEN ts_rank_cd(fp.cfts, ts_query, 32)::float ELSE 0.0
         END)::float AS hybrid_score
    FROM full_pool fp
    WHERE fp.sim >= match_threshold
    ORDER BY hybrid_score DESC
    LIMIT match_count;
END;
$$;

-- ===SPLIT===

-- PostgREST: ricarica lo schema così le nuove RPC sono subito visibili via REST
NOTIFY pgrst, 'reload schema';
