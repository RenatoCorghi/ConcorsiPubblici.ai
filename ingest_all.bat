@echo off
title Vettorializzazione Massiva
echo ========================================================
echo  Avvio Vettorializzazione Massiva di tutti i DB
echo ========================================================

echo.
echo [1/6] Ingestione Codici...
node scripts/rag-ingest.js "data/codici/civile.html" "Diritto Civile"
node scripts/rag-ingest.js "data/codici/penale.html" "Diritto Penale"
node scripts/rag-ingest.js "data/codici/procedura_civile.html" "Diritto Processuale Civile"
node scripts/rag-ingest.js "data/codici/procedura_penale.html" "Diritto Processuale Penale"
node scripts/rag-ingest.js "data/codici/costituzione.html" "Diritto Costituzionale"
node scripts/rag-ingest.js "data/codici/l241_90.html" "Diritto Amministrativo"
node scripts/rag-ingest.js "data/codici/processo_amministrativo.html" "Diritto Amministrativo"

echo.
echo [2/6] Ingestione Sentenze SS.UU. VIP...
node scripts/rag-ingest-ssuu-v2.js

echo.
echo [3/6] Ingestione Riviste VIP...
node scripts/rag-ingest-riviste.js

echo.
echo [4/6] Ingestione Sentenze Amministrative VIP...
node scripts/rag-ingest-admin-v3.js

echo.
echo [5/6] Ingestione Massimario VIP...
node scripts/rag-ingest-massimario.js

echo.
echo [6/6] Ingestione Giustizia Amministrativa (Tutte le sentenze - molto lungo)...
node scripts/rag-ingest-giustizia.js

echo.
echo ========================================================
echo  Vettorializzazione completata!
echo ========================================================
pause
