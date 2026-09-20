@echo off
cd /d "%~dp0"
node scripts\start-local.mjs
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%
