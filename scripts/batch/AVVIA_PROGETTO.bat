@echo off
title Avvio rapido CONCORSI.AI
echo ==========================================
echo    Sto avviando il server di CONCORSI.AI
echo ==========================================
echo.
echo [1/2] Apertura browser...
start http://localhost:3000

echo [2/2] Avvio motore AI locale (Custom Server)...
echo.

:: --- INSERISCI QUI LE TUE API KEYS ---
:: (Ora non serve più, le pesca in automatico dal file .env!)

node --env-file=.env js/local-server.js
pause
