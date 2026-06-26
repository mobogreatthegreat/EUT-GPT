<p align="center">
  <picture>
    <img src="https://img.shields.io/github/v/release/mobogreatthegreat/EUT-GPT?include_prereleases&style=flat-square&color=blueviolet"/>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/python-3.11%2B-blue?style=flat-square&logo=python&logoColor=white&labelColor=1a1a2e">
    <img src="https://img.shields.io/badge/python-3.11%2B-blue?style=flat-square&logo=python">
  </picture>
  <img src="https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-purple?style=flat-square&labelColor=1a1a2e"/>
  <img src="https://img.shields.io/github/downloads/mobogreatthegreat/EUT-GPT/total?style=flat-square&color=brightgreen"/>
</p>

<h1 align="center">EUT-GPT Project</h1>
<p align="center">
  <em>A desktop interface and CLI for AI conversations powered by OpenCode, themed around the Everything Upgrade Tree wiki.</em>
  <br>
</p>

<p align="center">
  <a href="#features">Features</a> -
  <a href="#running-app">Running App</a> -
  <a href="#running-from-source">From Source</a> -
  <a href="#configuration">Config</a> -
  <a href="#themes">Themes</a> -
  <a href="#troubleshooting">Troubleshooting</a> -
  <a href="#contributing">Contributing</a>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Running App](#running-app)
- [Running from Source](#running-from-source)
  - [Prerequisites](#prerequisites)
  - [Windows Build](#windows-build)
  - [Linux / macOS Build](#linux--macos-build)
- [First Run Behavior](#first-run-behavior)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
  - [System Prompt](#system-prompt)
  - [Themes](#themes)
  - [Server URL](#server-url)
  - [Temperature](#temperature)
- [CLI Commands](#cli-commands)
- [Model & Thinking Selection](#model--thinking-selection)
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
| **Model switching** | Select any provider/model from the composer toolbar |
| **Thinking control** | Set thinking complexity (none/minimal/low/medium/high/xhigh/max) tied to model variants |
| **12 baseplate themes** | Color schemes named after baseplates on [eutwiki.com](https://eutwiki.com/Category:Baseplates), with colors sourced from their currency templates |
| **Session management** | Rename by double-clicking, search, auto-naming from first message |
| **Temp (ephemeral) chats** | Toggle in sidebar - auto-deleted when you switch away |
| **Collapsible reasoning** | Model thinking shown in expandable blocks grouped with the response |
| **Custom frameless UI** | Clean design with centered timeline and dark themes |
| **CLI with full command set** | `/rename`, `/export`, `/history`, model/thinking/agent controls |
| **Cross-platform builds** | Portable `.exe` (Windows), AppImage (Linux), DMG (macOS) |

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
├── eutgpt-cli.spec            # PyInstaller spec (auto-generated)
├── build.bat                  # Windows build script
├── build.sh                   # Linux/macOS build script
├── cert.pfx                   # Self-signed code signing cert (auto-generated)
├── .gitignore
├── README.md
├── src-electron/
│   ├── main.js                # Electron main process
│   ├── preload.js             # Context bridge (IPC API)
│   ├── package.json           # Electron dependencies & builder config
│   ├── node_modules/          # Installed via npm install
│   ├── renderer/
│   │   ├── index.html         # UI layout
│   │   ├── style.css          # 12-theme CSS variable system
│   │   └── app.js             # Frontend logic
│   └── renderer-old/          # Original UI backup
├── dist/                      # Build output (generated)
├── build/                     # PyInstaller workdir (generated)
├── builds/                    # All precompiled project binaries
└── dist-electron-temp/        # Temp electron files (generated)
```

---

## Running App

The easiest way to use EUT-GPT is to download a pre-built release:

**Windows / Linux** - Download `EUT-GPT-Launcher-1.0.1-Win.exe` or `EUT-GPT-Launcher-1.0.1-Linux.AppImage` from the [Releases](https://github.com/mobogreatthegreat/EUT-GPT/releases) page and run it. No compilation needed.

**MacOS** - Pre-built binaries are not currently distributed for these platforms. See [Running from Source](#running-from-source) to compile from source.

---

## Running from Source

Download the source code from the [Releases](https://github.com/mobogreatthegreat/EUT-GPT/releases) page (or clone the repo) and compile it yourself.

### Prerequisites

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Python | 3.11+ | CLI and OpenCode server |
| Node.js | 18+ | Electron desktop app |
| npm | (comes with Node) | Electron dependencies |

Install Python from [python.org](https://python.org/downloads) and Node.js from [nodejs.org](https://nodejs.org).

### Windows Build

```cmd
cd eutgpt-app
build.bat
```

**Output:** `dist/EUT-GPT-Launcher-1.0.1.exe` (~81 MB) + `dist/eutgpt-cli.exe`

The script automatically:
- Installs PyInstaller if missing
- Compiles `eutgpt-cli.exe` into `dist/`
- Runs `electron-builder --win portable` for a self-contained single `.exe`

### Linux / macOS Build

```bash
cd eutgpt-app
chmod +x build.sh
./build.sh
```

**Output:** `dist/EUT-GPT-Launcher-1.0.1.dmg` (macOS) or `dist/EUT-GPT-Launcher-1.0.1.AppImage` (Linux)

> [!NOTE]
> MacOS currently has a known issue with compiling and you may not be able to use it on MacOS until it is fixed. The Linux build has been confirmed to be working.

> [!IMPORTANT]
> On some systems, Windows Defender may hold a lock on extracted Electron files during Windows builds. If you encounter lock errors, temporarily exclude the project directory from Windows Defender and retry.

---

## Configuration

### Themes

12 themes are available in the GUI, each named after a baseplate on the [EUT Wiki](https://eutwiki.com/Category:Baseplates). Theme colors are drawn from each baseplate's currency template:

| Theme | Baseplate | Accent Color |
|-------|-----------|-------------|
| `astronomy` | Astronomy Baseplate | `#9539cb` |
| `automation` | Automation Baseplate | `#ea4467` |
| `beta` | Beta Baseplate | `#87de4f` |
| `bonus` | Bonus Baseplate | `#3efc98` |
| `chips` | Chips Basement | `#D793FF` |
| `hardcore` | Hardcore Baseplate | `#ffa7a8/Rainbow Gradient` |
| `pointx` | Point-X Baseplate | `#d1a3e4` |
| `pointx-basement` | Point-X Basement | `#fdc830` |
| `points` | Points Baseplate | `#fefefe` |
| `prestige` | Prestige Baseplate | `#ffc965` |
| `qubits` | Qubits Baseplate | `#07c492` |
| `transcend` | Transcend Baseplate | `#65f0ff` |

Themes are persisted to `localStorage` under the key `eutgpt-theme`. Change themes in **Settings > Theme**. Each theme is defined as a `[data-theme="..."]` CSS block in `src-electron/renderer/style.css` using CSS custom properties.

### Server URL

The default server URL is `http://127.0.0.1:4096`. Override it in two ways:

- **Environment variable**: `OPENCODE_SERVER_URL=http://other-host:port`
- **GUI**: Settings > Server URL (displayed on launch, not persisted across restarts)

### Temperature

Adjust the model's creativity in **Settings > Temperature** (range: 0.0 to 2.0, default: 0.7). Lower values produce more deterministic outputs; higher values produce more creative responses.

---

## Model & Thinking Selection

The composer toolbar (above the chat input) contains two dropdowns:

1. **Model** - Select the AI provider and model (e.g., `opencode/deepseek-v4-flash-free`)
2. **Thinking** - Set the thinking complexity (`None` through `Max`). Only levels available for the selected model are shown.

The send button enables once a model is selected. The thinking level defaults to the first available option for the chosen model.

---

## CLI Commands

The CLI (`eutgpt_cli.py`) supports the following commands. Type `/help` in the CLI to see them at any time.

| Command | Description |
|---------|-------------|
| `/model [name]` | List available models or switch to a specific one (e.g. `opencode/deepseek-v4-flash-free@high`) |
| `/reasoning <level>` | Set reasoning effort via model variant (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) |
| `/variant <name>` | Explicitly set model variant |
| `/system [text]` | Show current system prompt or set a new one |
| `/temperature [n]` | Show or set temperature (0.0-2.0) |
| `/agents` | List available agents |
| `/agent [name]` | Show current agent or switch to a different one |
| `/sessions` | List all sessions |
| `/new [title]` | Create a new session with an optional title |
| `/rename <title>` | Rename the current session |
| `/clear` | Clear local message history for the current session |
| `/history [n]` | Show the last N messages (default: 10) |
| `/export [file]` | Export the current conversation to a JSON file |
| `/abort` | Abort the currently running response |
| `/config` | Show the current configuration (model, variant, reasoning, temperature, agent) |
| `/help` | Show the help message with all available commands |
| `/quit` | Exit the CLI |

> [!TIP]
> All commands are prefixed with `/`. Arguments containing spaces should be quoted. For example: `/rename "My Chat Session"`.

---

## Session Management

- **Auto-naming**: The first message you send in a session auto-generates a title (first 42 characters, truncated with `...`).
- **Rename**: Double-click a session title in the sidebar to edit it inline. Press Enter to save.
- **Search**: Use the search bar at the top of the sidebar to filter sessions by title.
- **Delete**: Click the ✕ button on a session item, then click the same ✕ again within 3 seconds to confirm deletion.

---

## Temp Chats

Toggle the switch next to the **New Chat** button to create a **temp (ephemeral) session**. Temp chats:

- Display a dashed border in the sidebar
- Show a lightning bolt icon on the welcome screen
- Are **auto-deleted** when you switch away to another session
- Are auto-deleted even if they contain messages
- Prevent accidental clutter from throwaway conversations

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + N` | New chat |
| `Ctrl + K` | Focus session search |
| `Ctrl + ,` | Open Settings |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `opencode not found` | The launcher auto-installs it. If it fails, run the official installer: `curl -fsSL https://opencode.ai/install \| sh` |
| `address already in use` | Another process is using port 4096. Kill it or set `OPENCODE_SERVER_URL` to a different port. |
| Build lock errors | Add a Windows Defender exclusion for the project directory, or restart and retry. |
| GUI loads but shows "Disconnected" | Ensure `opencode serve` is running. Check the server URL in Settings. |
| Messages are empty | Select a model in the composer toolbar before sending. |
| Hyperlinks not clickable | Make sure the response contains markdown links like `[text](url)`. Plain URLs are not auto-linked. |
| Theme doesn't apply fully | Some themed elements may require a window refresh. Press `Ctrl+R` to reload the renderer. |
| CLI exits immediately | The CLI requires `opencode serve` to be running in the background. Start it first. |
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
   - For UI changes: run `npm start` from `src-electron/`
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
