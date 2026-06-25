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
IF EXIST "dist-electron" rmdir /s /q "dist-electron" 2>nul

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

REM ---- Step 2: Launcher ----
ECHO.
ECHO  [2/2] Building EUT-GPT Launcher ...

REM ----- Create code signing cert if missing -----
IF NOT EXIST "cert.pfx" (
  ECHO  [*] Creating self-signed code signing certificate...
  powershell -Command "New-SelfSignedCertificate -Type Custom -Subject 'CN=EUT-GPT, O=EUT-GPT' -KeyUsage DigitalSignature -FriendlyName 'EUT-GPT' -CertStoreLocation 'Cert:\CurrentUser\My' -TextExtension '2.5.29.37={text}1.3.6.1.5.5.7.3.3' | Export-PfxCertificate -FilePath cert.pfx -Password (ConvertTo-SecureString -String 'eutgpt' -Force -AsPlainText)" >nul 2>&1
  IF EXIST "cert.pfx" (ECHO  [+] cert.pfx created) ELSE (ECHO  [!] Cert creation failed, signing may fail)
)

REM ----- Prepare win-unpacked manually (avoids app.asar lock) -----
ECHO  [*] Preparing Electron distribution...
mkdir "dist\win-unpacked" >nul 2>&1
xcopy /E /I /Y "electron\node_modules\electron\dist\*" "dist\win-unpacked\" >nul 2>&1
IF EXIST "dist\win-unpacked\resources\app.asar" del /F /Q "dist\win-unpacked\resources\app.asar" >nul 2>&1
mkdir "dist\win-unpacked\resources\app\renderer" >nul 2>&1
mkdir "dist\win-unpacked\resources\bin" >nul 2>&1
copy /Y "electron\main.js" "dist\win-unpacked\resources\app\main.js" >nul 2>&1
copy /Y "electron\preload.js" "dist\win-unpacked\resources\app\preload.js" >nul 2>&1
copy /Y "electron\package.json" "dist\win-unpacked\resources\app\package.json" >nul 2>&1
copy /Y "dist\eutgpt-cli.exe" "dist\win-unpacked\resources\bin\eutgpt-cli.exe" >nul 2>&1
xcopy /E /I /Y "electron\renderer\*" "dist\win-unpacked\resources\app\renderer\" >nul 2>&1
ECHO  [+] win-unpacked ready

cd electron
set CSC_LINK=%CD%\..\cert.pfx
set CSC_KEY_PASSWORD=eutgpt
ECHO  [*] Running electron-builder (this may take a while)...
call npx electron-builder --win portable --prepackaged "%CD%\..\dist\win-unpacked"
IF %ERRORLEVEL% NEQ 0 (
  ECHO  [!] electron-builder returned error level %ERRORLEVEL%
  cd ..
  PAUSE
  EXIT /B %ERRORLEVEL%
)
cd ..
ECHO  [+] portable build complete

REM ---- Verify ----
for /f "tokens=*" %%f in ('dir /b "dist\EUT-GPT-Launcher-*.exe" 2^>nul') do set "LAUNCHER_EXE=%%f"
if defined LAUNCHER_EXE (
  ECHO  [+] dist\!LAUNCHER_EXE!
) else (
  ECHO  [!] Launcher exe not found in dist\
  DIR /B "dist\*.exe" 2>nul
  PAUSE
  EXIT /B 1
)

ECHO.
ECHO  --- Build Complete --------------------------------
DIR /B "dist\*.exe" 2>nul
ECHO.
PAUSE
