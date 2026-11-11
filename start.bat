@echo off
rem AI Ofisni ishga tushirish: serverni yoqadi va brauzerda ochadi
start "" http://localhost:8765/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port 8765
