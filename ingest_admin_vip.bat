@echo off
title Vettorializzazione Admin VIP → Supabase
echo ========================================================
echo  Avvio Vettorializzazione Sentenze Admin VIP
echo  Fonte: sentenze_admin_vip/
echo  Destinazione: Supabase (rag_documents + rag_chunks)
echo  Modello Embedding: Gemini Embedding 2
echo ========================================================
cd %~dp0
node scripts\rag-ingest-admin-v3.js
echo.
echo Operazione completata.
pause
