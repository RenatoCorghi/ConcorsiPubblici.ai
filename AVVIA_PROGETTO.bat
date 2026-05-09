@echo off
TITLE ConcorsiPubblici.ai - Developer Mode
echo ==========================================
echo    CONCORSI.AI - AVVIO AMBIENTE LOCALE
echo ==========================================
echo.
echo Avvio Server API (porta 3001) + Vite Frontend (porta 3000)...
echo.
start /B cmd /c "node js/local-server.js"
timeout /t 2 /nobreak > nul
cmd /c "npm run dev"
