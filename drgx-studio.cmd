@echo off
setlocal
set "ROOT=%~dp0"
if exist "%ROOT%drgx-studio.exe" (
    "%ROOT%drgx-studio.exe" %*
    exit /b %ERRORLEVEL%
)
