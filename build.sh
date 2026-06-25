#!/usr/bin/env bash
set -euo pipefail

# ── Detect OS ─────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM=linux ;;
  Darwin*) PLATFORM=macos ;;
  *)       echo "[!] Unsupported OS: $OS"; exit 1 ;;
esac

CLI_OUTPUT="dist/eutgpt-cli"
if [ "$PLATFORM" = "macos" ]; then
  LAUNCHER_TARGET="--mac dmg"
else
  LAUNCHER_TARGET="--linux AppImage"
fi

echo ""
echo " --- EUT-GPT Builder ($PLATFORM) ---------------------------"
echo ""

# ── Check dependencies ────────────────────────────────────────
command -v python3 >/dev/null 2>&1 || { echo "[!] Python 3 not found"; exit 1; }
python3 -c "import PyInstaller" 2>/dev/null || { echo "[*] Installing PyInstaller..."; python3 -m pip install pyinstaller --quiet; }
command -v node >/dev/null 2>&1 || { echo "[!] Node.js not found"; exit 1; }

# ── Clean ─────────────────────────────────────────────────────
rm -rf dist build dist-electron

# ── Step 1: CLI ───────────────────────────────────────────────
echo ""
echo " [1/2] Building eutgpt-cli ..."
python3 -m PyInstaller --noconfirm --onefile --console --name "eutgpt-cli" \
  --distpath "dist" --workpath "build" \
  --hidden-import "urllib.error" --hidden-import "urllib.request" \
  --hidden-import "http.client" --hidden-import "json" \
  --hidden-import "threading" --hidden-import "shlex" --clean "eutgpt_cli.py"
echo " [+] dist/eutgpt-cli"

# ── Step 2: Launcher ──────────────────────────────────────────
echo ""
echo " [2/2] Building EUT-GPT Launcher ($PLATFORM) ..."
cd electron
# Disable code signing (not configured for CI/local builds)
export CSC_LINK=
export CSC_KEY_PASSWORD=
echo " [*] Running electron-builder (this may take a while)..."
npx electron-builder $LAUNCHER_TARGET
cd ..

# ── Verify ────────────────────────────────────────────────────
echo ""
LAUNCHER_FILE=$(ls dist/EUT-GPT-Launcher-* 2>/dev/null || true)
if [ -n "$LAUNCHER_FILE" ]; then
  echo " [+] $LAUNCHER_FILE"
else
  echo " [!] Launcher build may have failed"
  ls -la dist/ 2>/dev/null || true
  exit 1
fi

echo ""
echo " --- Build Complete -----------------------------------"
ls -lh dist/ 2>/dev/null || true
echo ""
