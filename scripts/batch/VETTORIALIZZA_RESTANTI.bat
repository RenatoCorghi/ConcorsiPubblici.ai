@echo off
echo ==============================================================
echo   VETTORIALIZZAZIONE DATABASE CONCORSI.AI (GEMINI EMBEDDING)
echo ==============================================================
echo.
echo Avvio processo Node.js per SSUU in corso...
node scripts/rag-ingest-ssuu.js

echo.
echo Avvio processo Node.js per Massimari in corso...
node scripts/rag-ingest-massimario.js

echo.
echo ==============================================================
echo   VETTORIALIZZAZIONE COMPLETATA! IL RAG E' ORA AGGIORNATO.
echo ==============================================================
pause
