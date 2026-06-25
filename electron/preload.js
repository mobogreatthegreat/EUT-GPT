const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eutgptAPI", {
  call: (method, path, body) =>
    ipcRenderer.invoke("api-call", { method, path, body }),

  promptAsync: (path, body) =>
    ipcRenderer.invoke("api-call-stream", { method: "POST", path, body }),

  getServerUrl: () => ipcRenderer.invoke("get-server-url"),

  onSSEEvent: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("sse-event", handler);
    return () => ipcRenderer.removeListener("sse-event", handler);
  },

  // Window controls
  minimize: () => ipcRenderer.invoke("window-minimize"),
  maximize: () => ipcRenderer.invoke("window-maximize"),
  close: () => ipcRenderer.invoke("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),

  // Session management
  deleteSession: (id) => ipcRenderer.invoke("delete-session", { id }),
  getMessageCount: (id) => ipcRenderer.invoke("get-message-count", { id }),
  renameSession: (id, title) => ipcRenderer.invoke("rename-session", { id, title }),

  // Version
  getVersion: () => ipcRenderer.invoke("get-version"),
  checkLatestVersion: () => ipcRenderer.invoke("check-latest-version"),
});
