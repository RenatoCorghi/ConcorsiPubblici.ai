-- ============================================================
-- MIGRAZIONE: Hybrid Search (Vettoriale + Full-Text + Metadata Filtering)
-- ============================================================
-- Data: 2026-05-12
-- Autore: Antigravity per ConcorsiPubblici.ai
--
-- Questa migrazione aggiunge:
-- 1. Una colonna tsvector per la full-text search (se non esiste)
-- 2. Un indice GIN per la full-text search
-- 3. Un trigger che aggiorna automaticamente il tsvector ad ogni INSERT/UPDATE
-- 4. Una funzione RPC match_documents_hybrid che fonde vettore + keyword
-- ============================================================

-- ============================================================
-- STEP 1: Colonna tsvector per Full-Text Search
-- ============================================================
-- Aggiungiamo una colonna 'fts' (Full-Text Search) alla tabella rag_chunks.
-- Questa colonna conterrà il tsvector pre-computato del contenuto,
-- evitando di calcolarlo ad ogni query.

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'rag_chunks' AND column_name = 'fts'
    ) THEN
        ALTER TABLE rag_chunks ADD COLUMN fts tsvector;
    END IF;
END $$;

-- ============================================================
-- STEP 2: Popola la colonna fts per le righe esistenti
-- ============================================================
-- Usiamo la configurazione 'italian' per lo stemming italiano,
-- che gestisce coniugazioni, plurali, etc.
-- Combiniamo materia (peso A) + tipo (peso B) + content (peso C)
-- per dare priorità ai filtri strutturali.

UPDATE rag_chunks
SET fts = 
    setweight(to_tsvector('italian', COALESCE(materia, '')), 'A') ||
    setweight(to_tsvector('italian', COALESCE(tipo, '')), 'B') ||
    setweight(to_tsvector('italian', COALESCE(content, '')), 'C')
WHERE fts IS NULL;

-- ============================================================
-- STEP 3: Indice GIN per full-text search (se non esiste)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rag_chunks_fts ON rag_chunks USING GIN (fts);

-- ============================================================
-- STEP 4: Trigger per aggiornamento automatico
-- ============================================================
-- Ogni volta che un chunk viene inserito o aggiornato,
-- la colonna fts viene ricalcolata automaticamente.

CREATE OR REPLACE FUNCTION update_rag_chunks_fts()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    NEW.fts := 
        setweight(to_tsvector('italian', COALESCE(NEW.materia, '')), 'A') ||
        setweight(to_tsvector('italian', COALESCE(NEW.tipo, '')), 'B') ||
        setweight(to_tsvector('italian', COALESCE(NEW.content, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger se esiste per evitare errori di duplicazione
DROP TRIGGER IF EXISTS trg_rag_chunks_fts ON rag_chunks;

CREATE TRIGGER trg_rag_chunks_fts
    BEFORE INSERT OR UPDATE OF content, materia, tipo
    ON rag_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_rag_chunks_fts();

-- ============================================================
-- STEP 5: Funzione RPC — match_documents_hybrid
-- ============================================================
-- Formula di scoring ibrido:
--   hybrid_score = (0.7 × semantic_score) + (0.3 × keyword_score)
--
-- - semantic_score: 1 - (cosine distance) dal pgvector (<=> operator)
-- - keyword_score:  ts_rank_cd normalizzato con full-text search
--
-- Parametri:
--   query_embedding    vector(768)   L'embedding della domanda
--   query_text         text          Il testo della domanda (per full-text)
--   match_count        int           Quanti risultati restituire (default 10)
--   match_threshold    float         Soglia minima di similarity semantica (default 0.3)
--   filter_materia     text          Filtro opzionale per materia (default NULL = tutte)
--   filter_tipo        text          Filtro opzionale per tipo documento (default NULL = tutti)

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
    -- Costruiamo la tsquery dal testo dell'utente.
    -- websearch_to_tsquery è più tollerante di plainto_tsquery:
    -- supporta operatori naturali ("OR", virgolette, trattini) senza errori di sintassi.
    IF query_text IS NOT NULL AND query_text <> '' THEN
        ts_query := websearch_to_tsquery('italian', query_text);
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
        -- Titolo dal documento padre
        d.titolo,
        -- Semantic score: 1 - distanza coseno (più alto = più simile)
        (1 - (c.embedding <=> query_embedding))::float AS similarity,
        -- Keyword score: ts_rank_cd con normalizzazione per lunghezza documento
        -- Se non c'è query testuale, il keyword_score è 0
        CASE
            WHEN ts_query IS NOT NULL AND c.fts IS NOT NULL
            THEN ts_rank_cd(c.fts, ts_query, 32)::float
            ELSE 0.0
        END AS keyword_score,
        -- Hybrid score: media pesata 70% vettore + 30% keyword
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
        -- Filtro semantico di soglia minima
        (1 - (c.embedding <=> query_embedding)) >= match_threshold
        -- Filtro opzionale per materia
        AND (filter_materia IS NULL OR c.materia = filter_materia)
        -- Filtro opzionale per tipo documento
        AND (filter_tipo IS NULL OR c.tipo = filter_tipo)
    ORDER BY hybrid_score DESC
    LIMIT match_count;
END;
$$;

-- ============================================================
-- STEP 6: Indice per velocizzare i filtri su materia e tipo
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rag_chunks_materia ON rag_chunks (materia);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tipo ON rag_chunks (tipo);

-- ============================================================
-- VERIFICA
-- ============================================================
-- Per testare: 
-- SELECT * FROM match_documents_hybrid(
--     query_embedding := '<vettore>',
--     query_text := 'eccesso di potere sviamento',
--     match_count := 5,
--     filter_materia := 'Diritto Amministrativo'
-- );
