@echo off
REM Double-click this file in Windows Explorer to start the local server.
REM It just runs start-server.py from this same folder — see that file,
REM or README.md, for why a local server is needed at all.
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    python start-server.py
    goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
    py start-server.py
    goto :eof
)

echo Python was not found on this computer.
echo Install it from https://python.org (check "Add python.exe to PATH"
echo during setup), then double-click this file again.
echo (See README.md for other ways to run this project.)
pause
