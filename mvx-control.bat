@echo off
REM MVX TUIOS headless service CLI - no UI or shell command evaluation
node "%~dp0mvx_service_control.cjs" %*
exit /b %ERRORLEVEL%
