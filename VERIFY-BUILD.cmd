@echo off
setlocal
cd /d "%~dp0"
if not exist "evidence" mkdir "evidence"
node scripts\verify.mjs --install-if-missing > "evidence\verify-build-output.txt" 2>&1
set "RESULT=%ERRORLEVEL%"
type "evidence\verify-build-output.txt"
echo.
echo VERIFY_BUILD_EXIT=%RESULT%
echo Saved log: evidence\verify-build-output.txt
echo No GitHub push, production D1 migration or Cloudflare deployment was performed.
pause
exit /b %RESULT%
