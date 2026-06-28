const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const { spawn, execSync } = require("child_process");

const DEFAULT_PORT = 4096;
const APP_VERSION = "1.0.3";
const OPENCODE_DIR = path.join(os.homedir(), ".opencode", "bin");
let serverUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
let serverProcess = null;

// ── Launcher ─────────────────────────────────────────────────

function isToolInstalled(name) {
  if (name === "opencode") {
    const binaryPath = path.join(OPENCODE_DIR, process.platform === "win32" ? "opencode.exe" : "opencode");
    if (require("fs").existsSync(binaryPath)) return true;
  }
  try {
    execSync(name === "opencode" ? "opencode --version" : `where ${name}`, {
      stdio: "ignore", shell: true,
    });
    return true;
  } catch { return false; }
}

function installOpencodeWindows() {
  try {
    try {
      execSync("choco --version", { stdio: "ignore", timeout: 10000 });
    } catch {
      execSync("winget install Chocolatey --accept-source-agreements", { stdio: "inherit", timeout: 120000 });
    }
    execSync("choco install opencode -y", { stdio: "inherit", timeout: 120000 });
    return true;
  } catch { return false; }
}

function installOpencodeUnix() {
  try {
    execSync('curl -fsSL https://opencode.ai/install | sh', { stdio: "inherit", timeout: 120000 });
    return true;
  } catch { return false; }
}

async function ensureOpencode() {
  if (isToolInstalled("opencode")) return true;
  const ok = process.platform === "win32" ? installOpencodeWindows() : installOpencodeUnix();
  return isToolInstalled("opencode");
}

// ── Server ────────────────────────────────────────────────────

function waitForServer(port, timeout = 30) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/global/health`, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { if (JSON.parse(data).healthy) return resolve(true); } catch {}
          retry();
        });
      });
      req.on("error", retry);
      req.setTimeout(2000, () => { req.destroy(); retry(); });
      function retry() {
        if (Date.now() - start < timeout * 1000) setTimeout(check, 1000);
        else resolve(false);
      }
    };
    check();
  });
}

async function startServer(port) {
  return new Promise((resolve) => {
    const opencodeBin = path.join(OPENCODE_DIR, process.platform === "win32" ? "opencode.exe" : "opencode");
    const cmd = require("fs").existsSync(opencodeBin) ? opencodeBin : "opencode";
    const proc = spawn(cmd, ["serve", "--port", String(port)], {
      stdio: "ignore", shell: true, windowsHide: true,
    });
    proc.on("error", () => resolve(null));
    proc.on("exit", () => { if (serverProcess === proc) serverProcess = null; });
    serverProcess = proc;
    resolve(proc);
  });
}

async function ensureServer(port) {
  try {
    const healthy = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/global/health`, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try { resolve(JSON.parse(data).healthy); } catch { resolve(false); }
        });
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
    if (healthy) return true;
  } catch {}
  const proc = await startServer(port);
  if (!proc) return false;
  return await waitForServer(port);
}

// ── Window ────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: "EUT-GPT Launcher",
    backgroundColor: "#07070a",
    icon: path.join(__dirname, "icon.png"),
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  return win;
}

// ── API ───────────────────────────────────────────────────────

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : { ok: true }); } catch { resolve({ ok: true, raw: data }); }
        } else { reject(new Error(`HTTP ${res.statusCode}: ${data}`)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── SSE ───────────────────────────────────────────────────────

function startSSE(win) {
  const url = new URL("/event", serverUrl);
  const req = http.get(url, (res) => {
    let buf = "";
    res.on("data", (chunk) => {
      buf += chunk.toString();
      const parts = buf.split("\n");
      buf = parts.pop();
      for (const line of parts) {
        if (line.startsWith("data:")) {
          try {
            const data = JSON.parse(line.slice(5));
            if (!win.isDestroyed()) win.webContents.send("sse-event", data);
          } catch {}
        }
      }
    });
    res.on("end", () => { if (!win.isDestroyed()) setTimeout(() => startSSE(win), 1000); });
    res.on("error", () => { if (!win.isDestroyed()) setTimeout(() => startSSE(win), 2000); });
  });
  req.on("error", () => { if (!win.isDestroyed()) setTimeout(() => startSSE(win), 2000); });
}

// ── IPC ───────────────────────────────────────────────────────

ipcMain.handle("api-call", async (_, { method, path, body }) => {
  try { return await api(method, path, body); } catch (e) { return { error: e.message }; }
});

ipcMain.handle("api-call-stream", async (_, { method, path, body }) => api(method, path, body));

ipcMain.handle("get-server-url", () => serverUrl);
ipcMain.handle("get-version", () => APP_VERSION);

ipcMain.handle("open-external", async (_, url) => {
  shell.openExternal(url);
});

ipcMain.handle("check-latest-version", async () => {
  return new Promise((resolve) => {
    const req = https.get("https://api.github.com/repos/mobogreatthegreat/EUT-GPT/tags", {
      headers: { "User-Agent": "EUT-GPT-Launcher" },
      timeout: 8000,
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        try { const tags = JSON.parse(data); resolve(tags[0]?.name || null); }
        catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
});

// Window controls
ipcMain.handle("window-minimize", (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.handle("window-maximize", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win?.isMaximized()) win.unmaximize(); else win?.maximize();
});
ipcMain.handle("window-close", (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle("window-is-maximized", (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized());

// Delete session
ipcMain.handle("delete-session", async (_, { id }) => {
  try { return await api("DELETE", `/session/${id}`); } catch (e) { return { error: e.message }; }
});

// Rename session
ipcMain.handle("rename-session", async (_, { id, title }) => {
  try { return await api("PATCH", `/session/${id}`, { title }); } catch (e) { return { error: e.message }; }
});

// Get message count for a session
ipcMain.handle("get-message-count", async (_, { id }) => {
  try {
    const data = await api("GET", `/session/${id}/message`);
    if (Array.isArray(data)) return data.length;
    return 0;
  } catch { return 0; }
});

// Launch CLI
ipcMain.handle("launch-cli", async () => {
  const resourcesPath = process.resourcesPath || path.join(__dirname, "..");
  const cliPath = path.join(resourcesPath, "bin", "eutgpt-cli.exe");
  try {
    spawn(cliPath, [], { stdio: "inherit", shell: true, env: { ...process.env, OPENCODE_SERVER_URL: serverUrl } });
    return { ok: true };
  } catch (e) { return { error: e.message }; }
});

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(async () => {
  const port = parseInt(process.env.OPENCODE_PORT || String(DEFAULT_PORT), 10);

  console.log("EUT-GPT Launcher: checking opencode...");
  const hasOpencode = await ensureOpencode();
  if (!hasOpencode) {
    dialog.showErrorBox("EUT-GPT Launcher", "Could not install opencode. Please install it manually:\nhttps://opencode.ai/docs#install");
    app.quit();
    return;
  }

  console.log("EUT-GPT Launcher: starting server...");
  const serverReady = await ensureServer(port);
  if (!serverReady) {
    dialog.showErrorBox("EUT-GPT Launcher", "Failed to start opencode server.");
    app.quit();
    return;
  }

  serverUrl = `http://127.0.0.1:${port}`;
  console.log(`EUT-GPT Launcher: server ready at ${serverUrl}`);

  const win = createWindow();
  startSSE(win);

  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});
