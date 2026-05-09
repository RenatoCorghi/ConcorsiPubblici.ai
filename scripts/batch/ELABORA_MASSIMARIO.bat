@echo off
TITLE Elaborazione Semantica Massimario - Concorsi.AI
echo ======================================================
echo    CONCORSI.AI - CHUNKING RELAZIONI MASSIMARIO
echo ======================================================
echo.
echo Sto avviando l'elaborazione dei PDF...
echo I risultati verranno salvati in: massimario_chunks/
echo.

cd scraper_cassazione
.\venv\Scripts\python.exe process_massimario_chunks.py

echo.
echo ======================================================
echo    ELABORAZIONE COMPLETATA! Premi un tasto per uscire.
echo ======================================================
pause
