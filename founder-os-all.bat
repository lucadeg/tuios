@echo off
cd /d "%~dp0..\..\founder-os-legacy-base"
title Founder OS Suite (:5173 + :3001)
node start-all.js
if errorlevel 1 pause
