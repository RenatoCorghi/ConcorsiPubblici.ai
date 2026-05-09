@echo off
TITLE Generazione VIP Massimario - Concorsi.AI
echo ======================================================
echo    CONCORSI.AI - GENERAZIONE SCHEDE VIP MASSIMARIO
echo ======================================================
echo.
echo Modello: Gemini 3.1 Pro (High)
echo Origine: scraper_cassazione/massimario_chunks
echo Destinazione: massimario_vip
echo.
echo Avvio processo Node.js in corso...
echo (Potrebbe richiedere diverso tempo a causa dei rate limit API)
echo.

node scripts/generate_massimario_vip.js

echo.
echo ======================================================
echo    PROCESSO COMPLETATO! Premi un tasto per uscire.
echo ======================================================
pause
