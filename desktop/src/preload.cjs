// Secure bridge between the renderer and the main process (Intel-only build).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("capsuleers", {
  // Write text to the OS clipboard (used by the "copy" buttons on share links / rows).
  clipboard: { write: (text) => ipcRenderer.invoke("clipboard:write", text) },
  // Custom window controls
  win: {
    minimize: () => ipcRenderer.send("win:minimize"),
    maximize: () => ipcRenderer.send("win:maximize"),
    close: () => ipcRenderer.send("win:close"),
    mini: () => ipcRenderer.send("win:mini"),
    restore: () => ipcRenderer.send("win:restore"),
    setMinWidth: (w) => ipcRenderer.send("win:set-min-width", w),
    onState: (cb) => ipcRenderer.on("win:state", (_e, max) => cb(max)),
    onMiniState: (cb) => ipcRenderer.on("win:mini-state", (_e, mini) => cb(mini)),
  },
  // Local intel + D-Scan from clipboard
  local: {
    toggle: () => ipcRenderer.invoke("local:toggle"),
    state: () => ipcRenderer.invoke("local:state"),
    scan: () => ipcRenderer.send("local:scan"),
    confirm: () => ipcRenderer.send("local:confirm"),
    detail: (who) => ipcRenderer.invoke("local:detail", who),
    // Share the last resolved Local intel → returns { id, url, expiresAt, pilotCount, copied } or { error }.
    share: () => ipcRenderer.invoke("local:share"),
    history: {
      list: () => ipcRenderer.invoke("local:history:list"),
      clear: () => ipcRenderer.invoke("local:history:clear"),
    },
    onDetected: (cb) => ipcRenderer.on("local:detected", (_e, p) => cb(p)),
    onStart: (cb) => ipcRenderer.on("local:start", (_e, p) => cb(p)),
    onProgress: (cb) => ipcRenderer.on("local:progress", (_e, p) => cb(p)),
    onResult: (cb) => ipcRenderer.on("local:result", (_e, p) => cb(p)),
    // D-Scan analysis (offline composition breakdown)
    onDScanStart: (cb) => ipcRenderer.on("dscan:start", (_e, p) => cb(p)),
    onDScanResult: (cb) => ipcRenderer.on("dscan:result", (_e, p) => cb(p)),
    shareDScan: () => ipcRenderer.invoke("dscan:share"),
  },
});
