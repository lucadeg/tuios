@echo off
cd /d "%~dp0..\..\founder-os-legacy-base\backend"
title Founder OS Backend (:3001)
node start-dev.js
if errorlevel 1 pause
