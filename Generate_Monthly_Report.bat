@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File .\scripts\Generate_Monthly_Report.ps1
