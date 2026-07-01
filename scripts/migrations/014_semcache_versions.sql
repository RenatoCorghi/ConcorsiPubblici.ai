-- ============================================================
-- Migration 014 — Versioni di corpus per la cache semantica RAG
--
-- Supporto lato DB per api/_semcache.js (cache semantica a due livelli,
-- gated da env RAG_SEMANTIC_CACHE=1):
--
-- (1) COLONNA version SU rag_family_stats, bumpata dal trigger già
--     esistente (rag_family_stats_maintain, migration 011) a ogni
--     insert/update/delete di chunk della famiglia. È il "vettore di
--     versioni" per l'invalidazione della cache: ogni entry cachata
--     salva la versione delle famiglie toccate al momento della
--     scrittura; al lookup, se la versione corrente differisce, l'entry
--     è stantia → miss + delete pigra. Nessuno script di ingestione va
--     modificato: il trigger fa tutto.
--
-- (2) COLONNA cache_status SU rag_quality_log ('l1_hit' | 'l2_hit' |
--     'miss' | NULL quando la cache è spenta): misura l'hit-rate reale
--     in produzione. Query utile:
--       SELECT cache_status, count(*) FROM rag_quality_log
--       WHERE created_at > now() - interval '7 days' GROUP BY 1;
--
-- Eseguire con: node scripts/migrations/run_migration_014.mjs
-- oppure incollando l'intero file nell'SQL Editor di Supabase.
-- ============================================================

-- ===SPLIT===

ALTER TABLE rag_family_stats
    ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;

-- Parti da 1 così un'entry cachata prima della migration (versions assenti)
-- non combacia mai per caso con la versione corrente
UPDATE rag_family_stats SET version = 1 WHERE version = 0;

ALTER TABLE rag_quality_log
    ADD COLUMN IF NOT EXISTS cache_status text;

-- ===SPLIT===

-- Trigger di mantenimento aggiornato: identico alla migration 011 + bump
-- di version su OGNI tocco della famiglia (e di __all__). Un UPDATE che
-- ri-embedda un chunk senza cambiarne la famiglia lascia chunk_count
-- invariato ma bumpa version due volte: è voluto (il contenuto vettoriale
-- è cambiato → la cache di quella famiglia va invalidata).
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
            SET chunk_count = chunk_count - 1,
                version = version + 1
            WHERE family IN (old_fam, '__all__');
    END IF;

    IF (TG_OP = 'UPDATE' OR TG_OP = 'INSERT') AND NEW.embedding IS NOT NULL THEN
        new_fam := COALESCE(NEW.materia_family, '__none__');
        INSERT INTO rag_family_stats (family, chunk_count, version)
            VALUES (new_fam, 1, 1), ('__all__', 1, 1)
        ON CONFLICT (family)
            DO UPDATE SET chunk_count = rag_family_stats.chunk_count + 1,
                          version = rag_family_stats.version + 1;
    END IF;

    RETURN NULL;
END;
$trig$;

-- ===SPLIT===

-- PostgREST: ricarica lo schema (la colonna version viene letta via REST
-- da api/_semcache.js: GET /rest/v1/rag_family_stats?select=family,version)
NOTIFY pgrst, 'reload schema';
