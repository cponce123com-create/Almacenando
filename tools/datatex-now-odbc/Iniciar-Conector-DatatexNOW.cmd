@echo off
setlocal
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-DatatexConnector.ps1"
if errorlevel 1 pause
