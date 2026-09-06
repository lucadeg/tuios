@echo off
cd /d "%~dp0..\..\founder-os-legacy-base\frontend"
title Founder OS Frontend (:5173)
node start-dev.cjs
if errorlevel 1 pause
