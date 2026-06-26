#!/usr/bin/env bash
set -euo pipefail

# ── Detect OS ─────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM=linux ;;
  Darwin*) PLATFORM=macos ;;
  *)       echo "[!] Unsupported OS: $OS"; exit 1 ;;
esac

CLI_NAME="${CLI_NAME:-eutgpt-cli}"
CLI_OUTPUT="dist/$CLI_NAME"
LAUNCHER_ARGS="${LAUNCHER_ARGS:-}"

echo ""
echo " --- EUT-GPT Builder ($PLATFORM) ---------------------------"
echo ""

# ── PYTHON VENV ───────────────────────────────────────────────
VENV_DIR=".venv-builder"
SYS_PYTHON="python3"
command -v python3 >/dev/null 2>&1 || SYS_PYTHON="python"
command -v $SYS_PYTHON >/dev/null 2>&1 || { echo "[!] Python 3 not found"; exit 1; }

if [ ! -f "$VENV_DIR/bin/activate" ]; then
  echo " [*] Creating Python virtual environment..."
  $SYS_PYTHON -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
PYTHON="$VENV_DIR/bin/python"

echo " [*] Ensuring PyInstaller is installed..."
pip install pyinstaller --quiet 2>/dev/null || pip install pyinstaller --quiet --break-system-packages 2>/dev/null || { echo "[!] Failed to install PyInstaller"; exit 1; }

command -v node >/dev/null 2>&1 || { echo "[!] Node.js not found"; exit 1; }

# ── Clean ─────────────────────────────────────────────────────
echo " [*] Cleaning previous builds..."
rm -rf dist build dist-electron-temp

# ── Install npm deps if needed ────────────────────────────────
if [ ! -f "src-electron/node_modules/.package-lock.json" ]; then
  echo " [*] Installing npm dependencies..."
  (cd src-electron && npm install)
fi

# ── Step 1: CLI ───────────────────────────────────────────────
echo ""
echo " [1/2] Building $CLI_NAME ..."
$PYTHON -m PyInstaller --noconfirm --onefile --console --name "$CLI_NAME" \
  --distpath "dist" --workpath "build" \
  --hidden-import "urllib.error" --hidden-import "urllib.request" \
  --hidden-import "http.client" --hidden-import "json" \
  --hidden-import "threading" --hidden-import "shlex" --clean "eutgpt_cli.py"
if [ ! -f "$CLI_OUTPUT" ]; then
  echo "[!] CLI build failed"
  exit 1
fi
echo " [+] $CLI_OUTPUT"

# ── Step 2: Launcher ──────────────────────────────────────────
echo ""
echo " [2/2] Building EUT-GPT Launcher ($PLATFORM) ..."

# Disable code signing (not configured for CI/local builds)
export CSC_LINK=
export CSC_KEY_PASSWORD=

echo " [*] Running electron-builder (this may take a while)..."
(cd src-electron && npx electron-builder $LAUNCHER_ARGS)

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
