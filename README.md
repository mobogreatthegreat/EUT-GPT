<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/python-3.11%2B-blue?style=flat-square&logo=python&logoColor=white&labelColor=1a1a2e">
    <img src="https://img.shields.io/badge/python-3.11%2B-blue?style=flat-square&logo=python">
  </picture>
  <img src="https://img.shields.io/badge/node-18%2B-green?style=flat-square&logo=node.js&logoColor=white&labelColor=1a1a2e"/>
  <img src="https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-purple?style=flat-square&labelColor=1a1a2e"/>
</p>

<h1 align="center">EUT-GPT Launcher</h1>
<p align="center">
  <em>A desktop interface and CLI for AI conversations powered by OpenCode, themed around the Everything Upgrade Tree wiki.</em>
  <br>
  <strong>Answers are restricted to <a href="https://eutwiki.com">eutwiki.com</a> content only.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> -
  <a href="#first-run-behavior">First Run</a> -
  <a href="#running-from-source">Source</a> -
  <a href="#compiling">Compile</a> -
  <a href="#configuration">Config</a> -
  <a href="#themes">Themes</a> -
  <a href="#troubleshooting">Troubleshooting</a> -
  <a href="#contributing">Contributing</a>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [First Run Behavior](#first-run-behavior)
- [Project Structure](#project-structure)
- [Running from Source](#running-from-source)
  - [Prerequisites](#prerequisites)
  - [CLI Only](#cli-only)
  - [Desktop App](#desktop-app)
- [Compiling](#compiling)
  - [Windows](#windows)
  - [macOS](#macos)
  - [Linux](#linux)
- [Configuration](#configuration)
  - [System Prompt](#system-prompt)
  - [Themes](#themes)
  - [Server URL](#server-url)
  - [Temperature](#temperature)
- [Model Selection](#model-selection)
- [Session Management](#session-management)
- [Temp Chats](#temp-chats)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
  - [Reporting Bugs](#reporting-bugs)
  - [Submitting Changes](#submitting-changes)
- [Transparency](#transparency)
- [License](#license)

---

## Overview

EUT-GPT Launcher is **two things in one**:

1. **A Python CLI** (`eutgpt_cli.py`) that connects to the [OpenCode](https://opencode.ai) server API for streaming AI conversations with model selection, reasoning-effort control, agent selection, and session management.
2. **An Electron desktop GUI** that wraps the CLI and provides a modern chat interface with a custom frameless title bar, **12 baseplate-themed color schemes** (named after EUT baseplates), collapsible reasoning blocks, and ephemeral temp chats.

Both interface with the same `opencode serve` back-end, which is **auto-installed and managed by the launcher** on first launch.

> [!NOTE]
> EUT-GPT does not run its own AI models. It requires the [OpenCode](https://opencode.ai) CLI to be installed (handled automatically on first launch). OpenCode connects to configured AI providers and manages model routing. EUT-GPT simply provides the chat interface.

---

## Features

| Feature | Description |
|---------|-------------|
| **Streaming responses** | Real-time SSE-based message streaming with typing indicators |
| **Model switching** | Select provider/model/variant from the composer toolbar |
| **Reasoning effort** | Set thinking complexity (none/minimal/low/medium/high/xhigh/max) tied to model variants |
| **12 baseplate themes** | Color schemes named after every baseplate on [eutwiki.com](https://eutwiki.com/Category:Baseplates), with colors sourced from their currency templates |
| **Session management** | Rename by double-clicking, search, auto-naming from first message |
| **Temp (ephemeral) chats** | Toggle in sidebar - auto-deleted when you switch away |
| **Collapsible reasoning** | Model thinking shown in expandable blocks grouped with the response |
| **Custom frameless UI** | Clean opencode-inspired design with centered timeline |
| **CLI with full command set** | `/rename`, `/export`, `/history`, model/agent/reasoning controls |
| **Cross-platform builds** | Portable `.exe` (Windows), AppImage (Linux), DMG (macOS) |
| **Auto-install** | OpenCode installed via official installer on first launch |

---

## First Run Behavior

When you launch the EUT-GPT desktop app for the first time, the following happens automatically:

1. **OpenCode check** - The launcher runs `opencode --version` to see if OpenCode is installed.
2. **Auto-install** - If OpenCode is missing, it installs it using the official installer:
   - **Windows:** `iex ((New-Object System.Net.WebClient).DownloadString('https://opencode.ai/install'))`
   - **macOS/Linux:** `curl -fsSL https://opencode.ai/install | sh`
3. **Server start** - The launcher runs `opencode serve` in the background, which starts an HTTP server at `http://127.0.0.1:4096`.
4. **Server ready** - Once the server reports healthy, the Electron window loads and connects.
5. **Session setup** - A default session is created. If existing sessions are found from a previous run, they are loaded.

> [!IMPORTANT]
> The OpenCode server runs as a child process of the launcher. When you close the launcher window, the server is terminated automatically. You can also start the server manually with `opencode serve` and point the launcher to a different URL in Settings.

---

## Project Structure

```
eutgpt-app/
├── eutgpt_cli.py              # Python CLI entry point
├── build.bat                  # Windows build script
├── build.sh                   # Linux/macOS build script
├── cert.pfx                   # Self-signed code signing cert (auto-generated)
├── .gitignore
├── README.md
├── electron/
│   ├── main.js                # Electron main process
│   ├── preload.js             # Context bridge (IPC API)
│   ├── package.json           # Electron dependencies & builder config
│   ├── node_modules/          # Installed via npm install
│   ├── renderer/
│   │   ├── index.html         # OpenCode-inspired UI
│   │   ├── style.css          # 12-theme CSS variable system
│   │   └── app.js             # Frontend logic
│   └── renderer-old/          # Original UI backup
├── dist/                      # Build output (generated)
├── build/                     # PyInstaller workdir (generated)
└── dist-electron/             # Electron build cache (generated)
```

---

## Running from Source

### Prerequisites

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Python | 3.11+ | CLI and OpenCode server |
| Node.js | 18+ | Electron desktop app |
| npm | (comes with Node) | Electron dependencies |

Install Python from [python.org](https://python.org/downloads) and Node.js from [nodejs.org](https://nodejs.org).

### CLI Only

Run the Python CLI directly without the desktop UI:

```bash
cd eutgpt-app

# Ensure OpenCode is installed (one time)
curl -fsSL https://opencode.ai/install | sh
# Or on Windows:
# iex ((New-Object System.Net.WebClient).DownloadString('https://opencode.ai/install'))

# Start the server in a separate terminal
opencode serve

# Run the CLI
python eutgpt_cli.py
```

The CLI connects to `http://127.0.0.1:4096` by default. Override with the `OPENCODE_SERVER_URL` environment variable.

> [!TIP]
> Type `/help` inside the CLI to see available commands.

### Desktop App

```bash
cd eutgpt-app/electron

# Install dependencies (first time only)
npm install

# Run in dev mode
npm start
```

This launches the Electron window. The launcher auto-installs OpenCode and starts the server if needed. You can also start the server yourself:

```bash
# Terminal 1: Start the server
opencode serve

# Terminal 2: Launch the GUI connected to the running server
cd eutgpt-app/electron
npm start
```

> [!NOTE]
> In dev mode, the CLI binary is not bundled. The launcher calls `opencode` directly from PATH. For the full bundled experience, use a [compiled build](#compiling).

---

## Compiling

Build scripts produce a **standalone portable executable** (no runtime dependencies required). The build process has two stages:

1. **Stage 1 - CLI**: PyInstaller compiles `eutgpt_cli.py` into a standalone binary.
2. **Stage 2 - Launcher**: electron-builder bundles the Electron app with the CLI binary into a platform-specific portable package.

### Windows

```cmd
cd eutgpt-app
build.bat
```

**Output:** `dist/EUT-GPT-Launcher-1.0.0.exe` (portable, ~83 MB)

The script automatically:
- Installs PyInstaller if missing
- Compiles `eutgpt-cli.exe` into `build/cli/`
- Creates a self-signed code signing certificate (`cert.pfx`)
- Runs electron-builder with `--prepackaged` to avoid app.asar lock issues
- Outputs a portable executable to `dist/`

> [!IMPORTANT]
> On some systems, Windows Defender may hold a lock on extracted Electron files. If you encounter `app.asar` lock errors, temporarily exclude the project directory from Windows Defender or restart and try again.

### macOS

```bash
cd eutgpt-app
chmod +x build.sh
./build.sh
```

**Output:** `dist/EUT-GPT-Launcher-1.0.0.dmg`

The script detects macOS automatically and:
- Compiles the CLI with PyInstaller
- Disables code signing (set `CSC_LINK` if you have a signing certificate)
- Builds the DMG with electron-builder

> [!NOTE]
> On macOS, you may need to install PyInstaller first: `pip3 install pyinstaller`

### Linux

```bash
cd eutgpt-app
chmod +x build.sh
./build.sh
```

**Output:** `dist/EUT-GPT-Launcher-1.0.0.AppImage`

The script detects Linux and builds an AppImage. Same two-stage process as Windows/macOS.

---

## Configuration

### System Prompt

The default system prompt is defined in `eutgpt_cli.py`:

```python
DEFAULT_SYSTEM_PROMPT = (
    "You are an AI assistant that can ONLY respond using information from "
    "https://eutwiki.com. You must not use any external knowledge, training data, "
    "or any other sources. If the information is not available on eutwiki.com, "
    "you must clearly state that the information is not available on eutwiki.com "
    "rather than making up an answer. Always cite eutwiki.com as your source."
)
```

Edit this constant and rebuild the CLI to change the default system prompt. The GUI does **not** expose a system prompt editor - it is intentionally source-only to prevent accidental changes.

> [!WARNING]
> The system prompt is the core restriction that limits the AI to responding only about EUT wiki content. Modifying it may cause the AI to use external knowledge.

### Themes

12 themes are available, each named after a baseplate on the [EUT Wiki](https://eutwiki.com/Category:Baseplates). Theme colors are drawn from each baseplate's currency template:

| Theme | Baseplate | Currency | Accent Color |
|-------|-----------|----------|-------------|
| `astronomy` | Astronomy Baseplate | γ (Gamma) | `#38bdf8` |
| `automation` | Automation Baseplate | ฿ (Bits) | `#48cae4` |
| `beta` | Beta Baseplate | - | `#eab308` |
| `bonus` | Bonus Baseplate | α (Alpha) | `#4ade80` |
| `chips` | Chips Basement | ◐ (Chips) | `#dc2626` |
| `donation` | Donation Baseplate | $ (Donations) | `#f59e0b` |
| `hardcore` | Hardcore Baseplate | ¤ (Ultimate) | `#ef4444` |
| `leaderboard` | Leaderboard Baseplate | - | `#fbbf24` |
| `lingo` | Lingo Baseplate | - | `#2dd4bf` |
| `mining` | Mining Baseplate | Ores | `#eab308` |
| `offline` | Offline Baseplate | - | `#6b7280` |
| `pointx` | Point-X Baseplate | ₽X (Point-X) | `#7c3aed` |
| `pointx-basement` | Point-X Basement | - | `#a855f7` |
| `points` | Points Baseplate | ₽ (Points) | `#f59e0b` |
| `points-basement` | Points Basement | - | `#d97706` |
| `prestige` | Prestige Baseplate | ₹ (Prestige) | `#c084fc` |
| `qubits` | Qubits Baseplate | Ψ (Qubits) | `#06b6d4` |
| `sacrifice` | Sacrifice Baseplate | - | `#dc2626` |
| `transcend` | Transcend Baseplate | τ (Transcend) | `#818cf8` |

Themes are persisted to `localStorage` under the key `eutgpt-theme`. Change themes in **Settings > Theme**. Each theme is defined as a `[data-theme="..."]` CSS block in `electron/renderer/style.css` using CSS custom properties.

### Server URL

The default server URL is `http://127.0.0.1:4096`. Override it in two ways:

- **Environment variable**: `OPENCODE_SERVER_URL=http://other-host:port`
- **GUI**: Settings > Server URL (updated on launch from environment, not persisted across restarts)

### Temperature

Adjust the model's creativity in **Settings > Temperature** (range: 0.0 to 2.0, default: 0.7). Lower values produce more deterministic outputs; higher values produce more creative responses.

---

## Model Selection

The composer toolbar (above the chat input) contains three dropdowns:

1. **Model** - Select the AI provider and model (e.g., `anthropic/claude-sonnet-4-6`)
2. **Variant** - Select a model variant if available (depends on the model)
3. **Reasoning Effort** - Set the thinking complexity (`none` through `max`)

**All three must be selected before the send button enables.** Defaults auto-pick the first available option when models load.

---

## Session Management

- **Auto-naming**: The first message you send in a session auto-generates a title (first 42 characters, truncated with `...`).
- **Rename**: Double-click a session title in the sidebar to edit it inline. Press Enter to save.
- **CLI rename**: Use `/rename New Title` in the CLI.
- **Search**: Use the search bar at the top of the sidebar to filter sessions by title.
- **Delete**: Click the ✕ button on a session item to delete it. A confirmation dialog appears.

---

## Temp Chats

Toggle the switch next to the **New Chat** button to create a **temp (ephemeral) session**. Temp chats:

- Display a dashed border in the sidebar
- Show a lightning bolt icon on the welcome screen
- Are **auto-deleted** when you switch away to another session
- Are auto-deleted even if they contain messages
- Prevent accidental clutter from throwaway conversations

> [!TIP]
> The old "New Temp Chat" button has been replaced with a toggle switch for a cleaner sidebar experience.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift + Enter` | New line in input |
| `Ctrl + N` | New chat |
| `Ctrl + K` | Focus session search |
| `Ctrl + ,` | Open Settings |
| `Double-click session title` | Rename session |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `opencode not found` | The launcher auto-installs it. If it fails, run the official installer: `curl -fsSL https://opencode.ai/install | sh` |
| `address already in use` | Another process is using port 4096. Kill it or set `OPENCODE_SERVER_URL` to a different port. |
| `app.asar` build error | Add a Windows Defender exclusion for the project directory, or restart and try again. |
| `winCodeSign` extraction fails | Manually download and extract winCodeSign to `%LOCALAPPDATA%\electron-builder\cache\winCodeSign\`. |
| GUI loads but shows "Disconnected" | Ensure `opencode serve` is running. Check the server URL in Settings. |
| Messages are empty | The model/variant/effort must **all** be selected in the composer toolbar before sending. |
| Hyperlinks not clickable | Make sure the response contains markdown links like `[text](url)`. Plain URLs are not auto-linked. |
| Theme doesn't apply fully | Some themed elements may require a window refresh. Press `Ctrl+R` to reload the renderer. |
| CLI exits immediately | The CLI requires `opencode serve` to be running in the background. Start it first. |
| Build fails on macOS signing | The build script disables code signing with `CSC_LINK=`. Set your own cert if needed. |
| Can't find the system prompt in GUI | The system prompt is intentionally source-only. Edit `DEFAULT_SYSTEM_PROMPT` in `eutgpt_cli.py`. |

---

## Contributing

### Reporting Bugs

If you encounter a bug, please [open an issue](https://github.com/mobogreatthegreat/EUT-GPT/issues) with:

- A clear title and description
- Steps to reproduce the behavior
- Expected vs actual behavior
- Screenshots or error logs (if applicable)
- Your platform (Windows/macOS/Linux) and EUT-GPT version

### Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test your changes:
   - For UI changes: run `npm start` from `electron/`
   - For CLI changes: run `python eutgpt_cli.py` while `opencode serve` is running
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

**Code style guidelines:**
- Python: Follow PEP 8, use type hints, keep functions focused
- JavaScript: ES6+ syntax, `const`/`let` over `var`, camelCase
- CSS: All theme colors use CSS custom properties in `[data-theme="..."]` blocks
- No inline comments in source code unless explaining a non-obvious decision
- Match the existing code style and conventions

---

## Transparency

EUT-GPT was developed with assistance from various AI models for parts of the codebase and documentation. The core logic, CLI implementation and build system were written by the project maintainer (@mobogreatthegreat).

The OpenCode server that powers the AI backend is an [open-source project](https://github.com/anomalyco/opencode) with over 160,000 GitHub stars and 7.5M monthly users. EUT-GPT is an independent interface that uses the OpenCode API - all AI responses are handled by the OpenCode server and its configured providers.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with Python, Electron, and OpenCode. System prompt restricts answers to <a href="https://eutwiki.com">eutwiki.com</a> content.</sub>
  <br>
  <sub>EUT-GPT is not affiliated with OpenCode or Anomaly.</sub>
</p>
