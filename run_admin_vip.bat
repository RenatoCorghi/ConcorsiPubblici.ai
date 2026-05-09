@echo off
title Generazione VIP Amministrativo (TAR/CdS)
echo ========================================================
echo Avvio processo di estrazione e generazione Schede VIP RAG
echo Modello: Gemini 3 Flash Preview
echo Logica: Triage a 3 Livelli (Top, Procedurale, Scarto)
echo ========================================================
cd %~dp0
node scripts\generate_admin_vip.js
pause
