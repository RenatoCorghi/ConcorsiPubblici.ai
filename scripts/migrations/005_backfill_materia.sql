-- ============================================================
-- BACKFILL MATERIA per 56K sentenze con materia NULL
-- ============================================================
-- Strategia: usa il titolo dalla tabella rag_documents
-- I file snciv* sono Civile, snpen* sono Penale
-- ============================================================

-- Step 1: Verifica quanti chunk NULL hanno un document con titolo Cass. Civ.
-- (eseguire solo per verifica, non modifica nulla)
-- SELECT count(*) FROM rag_chunks c
-- JOIN rag_documents d ON d.id = c.document_id
-- WHERE c.materia IS NULL
-- AND d.titolo LIKE 'Cass. Civ.%';

-- Step 2: Backfill Civile
UPDATE rag_chunks
SET materia = 'Diritto Civile'
WHERE materia IS NULL
AND tipo = 'sentenza_sez_semplici'
AND document_id IN (
    SELECT id FROM rag_documents
    WHERE titolo LIKE 'Cass. Civ.%'
);

-- Step 3: Backfill Penale (per sicurezza, eventuali penali sfuggite)
UPDATE rag_chunks
SET materia = 'Diritto Penale'
WHERE materia IS NULL
AND tipo = 'sentenza_sez_semplici'
AND document_id IN (
    SELECT id FROM rag_documents
    WHERE titolo LIKE 'Cass. Pen.%'
);
