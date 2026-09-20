@echo off
setlocal
cd /d "%~dp0"
if not exist "evidence" mkdir "evidence"
node scripts\check-offline.mjs > "evidence\local-check-output.txt" 2>&1
set "RESULT=%ERRORLEVEL%"
type "evidence\local-check-output.txt"
echo.
echo CHECK_EXIT=%RESULT%
echo Saved log: evidence\local-check-output.txt
echo No GitHub, production D1 or Cloudflare deployment was performed.
pause
exit /b %RESULT%
