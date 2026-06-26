@echo off
SETLOCAL ENABLEDELAYEDEXPANSION
TITLE EUT-GPT Builder

ECHO.
ECHO  --- EUT-GPT Builder -------------------------------
ECHO.

REM ---- Check dependencies ----
where python >nul 2>&1 || (ECHO [!] Python not found. & PAUSE & EXIT /B 1)
python -c "import PyInstaller" 2>nul || (ECHO [*] Installing PyInstaller... & python -m pip install pyinstaller --quiet)
where node >nul 2>&1 || (ECHO [!] Node.js not found. & PAUSE & EXIT /B 1)

REM ---- Clean ----
IF EXIST "dist" rmdir /s /q "dist" 2>nul
IF EXIST "build" rmdir /s /q "build" 2>nul
IF EXIST "dist-electron-temp" rmdir /s /q "dist-electron-temp" 2>nul

REM ---- Step 1: CLI ----
ECHO.
ECHO  [1/2] Building eutgpt-cli.exe ...
python -m PyInstaller --noconfirm --onefile --console --name "eutgpt-cli" ^
  --distpath "dist" --workpath "build" ^
  --hidden-import "urllib.error" --hidden-import "urllib.request" ^
  --hidden-import "http.client" --hidden-import "json" ^
  --hidden-import "threading" --hidden-import "shlex" --clean "eutgpt_cli.py"
IF %ERRORLEVEL% NEQ 0 (ECHO [!] CLI build failed & PAUSE & EXIT /B 1)
ECHO  [+] dist\eutgpt-cli.exe

REM ---- Step 2: Electron UI (portable single exe) ----
ECHO.
ECHO  [2/2] Building EUT-GPT Launcher (portable) ...

REM ----- Install npm dependencies if needed -----
IF NOT EXIST "src-electron\node_modules\.package-lock.json" (
  ECHO  [*] Installing npm dependencies...
  pushd src-electron
  call npm install
  popd
  IF !ERRORLEVEL! NEQ 0 (ECHO [!] npm install failed & PAUSE & EXIT /B 1)
  ECHO  [+] npm dependencies installed
)

REM ----- Kill lingering electron processes -----
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "EUT-GPT Launcher.exe" >nul 2>&1

REM ----- Electron builder (portable) -----
pushd src-electron
ECHO  [*] Running electron-builder (portable)...
call npx electron-builder --win portable
IF !ERRORLEVEL! NEQ 0 (
  ECHO  [!] electron-builder failed with error level !ERRORLEVEL!
  popd
  PAUSE
  EXIT /B !ERRORLEVEL!
)
popd
ECHO  [+] portable build complete

REM ---- Verify outputs ----
ECHO.
ECHO  --- Build Complete --------------------------------
ECHO.
for /f "tokens=*" %%f in ('dir /b "dist\*.exe" 2^>nul') do (
  ECHO  [+] dist\%%f
)
ECHO.
PAUSE
