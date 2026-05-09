@echo off
title Generazione VIP Riviste (Giurisprudenza Italiana)
echo ========================================================
echo Avvio processo di estrazione massiva Riviste Giuridiche
echo Modello: Gemini 3 Flash Preview
echo Logica: R-CAFAR V3 (Thinking + Bold + Latin Brocards)
echo ========================================================
cd %~dp0
node scripts\generate_riviste_vip.js
pause
