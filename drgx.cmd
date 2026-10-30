@echo off
setlocal
set "ROOT=%~dp0"
set "NATIVE_CLI=%ROOT%cli\target\release\drgx.exe"
if exist "%NATIVE_CLI%" (
    "%NATIVE_CLI%" %*
    exit /b %ERRORLEVEL%
)
echo [!] Missing %NATIVE_CLI%
exit /b 1
