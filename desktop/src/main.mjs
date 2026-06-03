// Electron main process for Capsuleers.Intel — the Intel-only desktop app.
// Opens the window, drives the clipboard-watch Local/D-Scan detection, and routes
// the intel features to the renderer over IPC. No local LLM, no RAG index, no model
// downloads: every feature here is either offline (D-Scan composition via the bundled
// eve-fit-engine SDE) or a live public-API lookup (eve-kill, ESI, EVE Ref).
import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, Notification, dialog, screen, clipboard } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { localIntel, characterDetail, sharePilotIntel, analyzeDScan, shareDScan } from "./intel.mjs";
import { listEntries as listShareHistory, addEntry as addShareHistory, clearEntries as clearShareHistory } from "./intel-history.mjs";
import { startWatch, stopWatch, isEnabled, scanNow } from "./clipboard-watch.mjs";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, "..", "assets");
let win, tray;
let prevBounds = null;  // window size before mini-mode
const MIN_WIDTH = 760;                  // hard minimum window width (clamped to the screen)
let normalMinSize = { w: 72, h: 72 };  // min window size in normal mode (relaxed during mini-mode)
let pendingLocal = null;  // last detected Local, awaiting user confirmation
let lastLocalResult = null;  // last resolved intel result, kept so "share" has the roster
let lastDScanRows = null;    // last analyzed D-Scan rows, kept so "share" can re-send them
// The clipboard watch is ON by default (it's the whole point of the app). We persist
// only an explicit OFF so a user who disables it keeps it disabled across restarts.
const WATCH_STATE_FILE = () => path.join(app.getPath("userData"), "clipboard-watch.json");
function watchEnabledPref() {
  try { return JSON.parse(readFileSync(WATCH_STATE_FILE(), "utf-8")).enabled !== false; } catch { return true; }
}
function persistWatchState(enabled) {
  try {
    mkdirSync(path.dirname(WATCH_STATE_FILE()), { recursive: true });
    writeFileSync(WATCH_STATE_FILE(), JSON.stringify({ enabled }));
  } catch { /* best-effort: the default-on behaviour still applies next launch */ }
}

// Main-process strings (tray, dialogs, notifications), localized to the system
// language with the same logic as the renderer: Italian if the locale is it-*,
// otherwise English. M() resolves the dictionary at call time (after app ready).
const MSTR = {
  it: {
    trayShow: "Mostra Capsuleers.Intel",
    trayClipboard: (on) => `Intel Local da appunti: ${on ? "ATTIVO ✓" : "spento"}`,
    trayScan: "Scansiona appunti ora", trayQuit: "Esci",
    notifTitle: "Rilevata Local di EVE",
    notifBody: (n) => `${n} piloti negli appunti — clicca per l'intel`,
    confirmTitle: "Intel Local",
    confirmMsg: (n) => `Mostrare l'intel per ${n} piloti?`,
    confirmDetail: "I nomi rilevati negli appunti sembrano una Local di EVE.",
    btnNo: "No", btnShowIntel: "Sì, mostra intel",
    notifTitleD: "Rilevato D-Scan", notifBodyD: (n) => `${n} oggetti sul D-Scan — clicca per l'analisi`,
    confirmTitleD: "Analisi D-Scan", confirmMsgD: (n) => `Analizzare il D-Scan (${n} oggetti)?`,
    confirmDetailD: "Il testo negli appunti sembra un D-Scan di EVE.", btnShowDscan: "Sì, analizza",
    noLocalMsg: "Nessuna Local negli appunti.",
    noLocalDetail: "Copia la lista dei piloti dalla finestra Local di EVE (Ctrl+A, Ctrl+C) e riprova.",
    cbDiag: "Diagnosi appunti", cbLines: "righe", cbEmpty: "(appunti vuoti)",
    btnOk: "OK",
    updTitle: "Aggiornamento disponibile",
    updMsg: (v) => `La versione ${v} è stata scaricata.`,
    updDetail: "Vuoi riavviare ora per installarla? Puoi anche farlo più tardi: verrà applicata alla prossima chiusura.",
    updLater: "Più tardi", updRestart: "Riavvia e installa",
  },
  en: {
    trayShow: "Show Capsuleers.Intel",
    trayClipboard: (on) => `Local intel from clipboard: ${on ? "ON ✓" : "off"}`,
    trayScan: "Scan clipboard now", trayQuit: "Quit",
    notifTitle: "EVE Local detected",
    notifBody: (n) => `${n} pilots in the clipboard — click for intel`,
    confirmTitle: "Local intel",
    confirmMsg: (n) => `Show intel for ${n} pilots?`,
    confirmDetail: "The names detected in the clipboard look like an EVE Local.",
    btnNo: "No", btnShowIntel: "Yes, show intel",
    notifTitleD: "D-Scan detected", notifBodyD: (n) => `${n} objects on D-Scan — click to analyze`,
    confirmTitleD: "D-Scan analysis", confirmMsgD: (n) => `Analyze the D-Scan (${n} objects)?`,
    confirmDetailD: "The clipboard text looks like an EVE D-Scan.", btnShowDscan: "Yes, analyze",
    noLocalMsg: "No Local in the clipboard.",
    noLocalDetail: "Copy the pilot list from EVE's Local window (Ctrl+A, Ctrl+C) and try again.",
    cbDiag: "Clipboard diagnostic", cbLines: "lines", cbEmpty: "(clipboard empty)",
    btnOk: "OK",
    updTitle: "Update available",
    updMsg: (v) => `Version ${v} has been downloaded.`,
    updDetail: "Restart now to install it? You can also do it later: it will be applied on next quit.",
    updLater: "Later", updRestart: "Restart & install",
  },
};
const M = () => MSTR[(app.getLocale() || "en").toLowerCase().startsWith("it") ? "it" : "en"];

// A 16:9 size that fits within the primary monitor's work area, centered on it.
function windowGeometry() {
  const { workArea } = screen.getPrimaryDisplay();  // primary monitor (taskbar excluded)
  let w = Math.min(1180, Math.round(workArea.width * 0.9));
  let h = Math.round(w * 9 / 16);
  if (h > workArea.height * 0.9) { h = Math.round(workArea.height * 0.9); w = Math.round(h * 16 / 9); }
  w = Math.min(w, workArea.width);
  const x = workArea.x + Math.round((workArea.width - w) / 2);
  const y = workArea.y + Math.round((workArea.height - h) / 2);
  return { x, y, width: w, height: h };
}

// ── Persisted window size/position ──────────────────────────────────────────
const WINDOW_STATE_FILE = () => path.join(app.getPath("userData"), "window-state.json");

function loadWindowState() {
  try {
    const s = JSON.parse(readFileSync(WINDOW_STATE_FILE(), "utf-8"));
    if (!s || !Number.isFinite(s.width) || !Number.isFinite(s.height)) return null;
    if (s.width < 400 || s.height < 300) return null;   // ignore mini / garbage sizes
    const pa = screen.getPrimaryDisplay().workArea;
    const width = Math.min(s.width, pa.width);
    const height = Math.min(s.height, pa.height);
    const onScreen = Number.isFinite(s.x) && Number.isFinite(s.y) &&
      screen.getAllDisplays().some((d) => {
        const a = d.workArea;
        return s.x < a.x + a.width && s.x + width > a.x && s.y < a.y + a.height && s.y + height > a.y;
      });
    const max = { maximized: typeof s.maximized === "boolean" ? s.maximized : undefined };
    return onScreen ? { x: s.x, y: s.y, width, height, ...max } : { width, height, ...max };
  } catch { return null; }
}

let _saveBoundsT = null;
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  if (prevBounds || win.isMinimized()) return;   // skip mini-mode / minimized
  const maximized = win.isMaximized();
  const b = win.getNormalBounds();   // windowed bounds even while maximized (for the un-maximize size)
  if (b.width < 400 || b.height < 300) return;   // safety: never persist the mini icon
  try {
    mkdirSync(path.dirname(WINDOW_STATE_FILE()), { recursive: true });
    writeFileSync(WINDOW_STATE_FILE(), JSON.stringify({ ...b, maximized }));
  } catch { /* best-effort: window memory is non-critical */ }
}
function scheduleSaveWindowState() { clearTimeout(_saveBoundsT); _saveBoundsT = setTimeout(saveWindowState, 500); }

// Apply the hard minimum window size, clamped to the screen. Stored in
// normalMinSize so mini-mode can relax and restore it.
function applyNormalMinSize() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.min(MIN_WIDTH, wa.width);
  const h = Math.min(560, wa.height);
  normalMinSize = { w, h };
  if (!prevBounds && win && !win.isDestroyed()) win.setMinimumSize(w, h);
}

function createWindow() {
  const saved = loadWindowState();
  const geo = saved || windowGeometry();   // remembered windowed size, else a sane default
  win = new BrowserWindow({
    x: geo.x, y: geo.y, width: geo.width, height: geo.height,
    minWidth: 72, minHeight: 72,
    title: "Capsuleers.Intel",
    icon: path.join(ASSETS, "icon-256.png"),
    frame: false,                 // no OS title bar/chrome
    backgroundColor: "#0a0b0d",   // avoid the white flash at startup
    // backgroundThrottling off: while you game (app in the background, maybe on
    // another monitor) the renderer must keep reacting — the Local banner + sound.
    webPreferences: { preload: path.join(HERE, "preload.cjs"), backgroundThrottling: false },
  });
  win.loadFile(path.join(HERE, "renderer", "index.html"));
  applyNormalMinSize();
  if (saved?.maximized === true) win.maximize();   // windowed by default; only restore an explicit maximize
  win.on("maximize", () => { win.webContents.send("win:state", true); scheduleSaveWindowState(); });
  win.on("unmaximize", () => { win.webContents.send("win:state", false); scheduleSaveWindowState(); });
  win.on("focus", () => { try { win.flashFrame(false); } catch { /* noop */ } });
  win.on("resize", scheduleSaveWindowState);
  win.on("move", scheduleSaveWindowState);
  win.on("close", saveWindowState);

  // External links (eve-kill, capsuleers.app share links) open in the system browser.
  const openExternal = (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { e.preventDefault(); openExternal(url); });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, "tray.png")));
  tray.setToolTip("Capsuleers.Intel");
  refreshTrayMenu();
  tray.on("click", () => (win.isVisible() ? win.hide() : showWindow()));
}

// The tray menu includes the clipboard-watch toggle (and shows its state).
function refreshTrayMenu() {
  if (!tray) return;
  const m = M();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: m.trayShow, click: showWindow },
    { type: "separator" },
    { label: m.trayClipboard(isEnabled()), click: toggleClipboardWatch },
    { label: m.trayScan, click: scanClipboardNow },
    { type: "separator" },
    { label: m.trayQuit, click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function showWindow() {
  if (prevBounds) exitMini();  // if it was in mini-mode, restore it
  win.show();
  win.focus();
}

function enterMini() {
  prevBounds = win.getBounds();
  win.setMinimumSize(48, 48);     // relax the header-fit minimum so the 96px icon fits
  win.setResizable(true);
  win.setSize(96, 96);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setResizable(false);
  win.webContents.send("win:mini-state", true);
}

function exitMini() {
  win.setResizable(true);
  win.setAlwaysOnTop(false);
  if (prevBounds) { win.setBounds(prevBounds); prevBounds = null; }
  else win.setBounds(windowGeometry());
  win.setMinimumSize(normalMinSize.w, normalMinSize.h);  // restore the header-fit minimum
  win.webContents.send("win:mini-state", false);
}

// ── Local intel from the clipboard ─────────────────────────────────────────

// Enable/disable the watch. No prompt: it's the app's default mode. The on/off
// choice is persisted so a deliberate disable survives a restart.
function toggleClipboardWatch() {
  if (isEnabled()) { stopWatch(); persistWatchState(false); }
  else { startWatch(onScanDetected); persistWatchState(true); }
  refreshTrayMenu();
}

// A scan was detected (Local roster OR D-Scan): notify via OS toast (click →
// confirm), flash the taskbar, and ALSO tell the renderer (in-app banner).
function scanCount(p) { return p.kind === "dscan" ? p.rows.length : p.names.length; }
function onScanDetected(payload) {
  pendingLocal = payload;
  const m = M();
  const isD = payload.kind === "dscan";
  const count = scanCount(payload);
  if (Notification.isSupported()) {
    const n = new Notification({
      title: isD ? m.notifTitleD : m.notifTitle,
      body: isD ? m.notifBodyD(count) : m.notifBody(count),
      silent: false,
    });
    n.on("click", () => confirmScan(payload));
    n.show();
  }
  try { if (!win?.isFocused()) win?.flashFrame(true); } catch { /* best-effort */ }
  if (!win?.isDestroyed()) win.webContents.send("local:detected", { kind: payload.kind, count });
}

// Explicit confirmation (popup), then run the matching analysis.
async function confirmScan(payload) {
  showWindow();
  const m = M();
  const isD = payload.kind === "dscan";
  const count = scanCount(payload);
  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    title: isD ? m.confirmTitleD : m.confirmTitle,
    message: isD ? m.confirmMsgD(count) : m.confirmMsg(count),
    detail: isD ? m.confirmDetailD : m.confirmDetail,
    buttons: [m.btnNo, isD ? m.btnShowDscan : m.btnShowIntel],
    defaultId: 1, cancelId: 0, noLink: true,
  });
  if (response === 1) runScan(payload);
}

function runScan(payload) {
  if (payload.kind === "dscan") runDScan(payload.rows);
  else runLocalIntel(payload.names);
}

// Local roster → per-pilot eve-kill intel (incremental results to the renderer).
async function runLocalIntel(names) {
  win?.webContents.send("local:start", { total: names.length });
  try {
    const res = await localIntel(names, {
      cap: 100, concurrency: 4,
      onProgress: (done, total) => win?.webContents.send("local:progress", { done, total }),
    });
    lastLocalResult = res;   // retain so the renderer's "Share" button has the roster
    win?.webContents.send("local:result", res);
  } catch (e) {
    win?.webContents.send("local:result", { error: e.message, rows: [], total: names.length });
  }
}

// D-Scan → offline composition breakdown (classified from the bundled SDE).
async function runDScan(rows) {
  lastDScanRows = rows;   // retain so the renderer's "Share" button can re-send them
  win?.webContents.send("dscan:start", { total: rows.length });
  try {
    win?.webContents.send("dscan:result", await analyzeDScan(rows));
  } catch (e) {
    win?.webContents.send("dscan:result", { error: e.message });
  }
}

// Tray "scan now" button: forces an immediate check of the clipboard.
function scanClipboardNow() {
  const payload = scanNow();
  if (payload) confirmScan(payload);
  else {
    showWindow();
    const m = M();
    // Diagnostic preview of the actual clipboard, so a user whose EVE copy isn't
    // recognized can report what the client really puts on the clipboard.
    const raw = (clipboard.readText() || "");
    const lines = raw.split(/\r\n|\r|\n/);
    const preview = raw.trim()
      ? `[${m.cbLines}: ${lines.length}]\n` + lines.slice(0, 6).map((l) => "» " + l).join("\n").slice(0, 700)
      : m.cbEmpty;
    dialog.showMessageBox(win, {
      type: "info", title: m.confirmTitle,
      message: m.noLocalMsg,
      detail: `${m.noLocalDetail}\n\n— ${m.cbDiag} —\n${preview}`,
      buttons: [m.btnOk], noLink: true,
    });
  }
}

// Auto-update of the app's code (electron-updater, GitHub Releases channel). The
// download happens in the background; when ready, we ask whether to restart.
function setupAutoUpdate() {
  if (!app.isPackaged) return;  // in dev there's no package to update
  autoUpdater.autoDownload = true;
  autoUpdater.on("update-downloaded", async (info) => {
    const m = M();
    const { response } = await dialog.showMessageBox(win, {
      type: "info", title: m.updTitle, message: m.updMsg(info.version),
      detail: m.updDetail, buttons: [m.updLater, m.updRestart],
      defaultId: 1, cancelId: 0, noLink: true,
    });
    if (response === 1) autoUpdater.quitAndInstall();
  });
  // Errors (no network, no release, unsigned app in testing…) don't bother the user.
  autoUpdater.on("error", () => {});
  autoUpdater.checkForUpdates().catch(() => {});
}

app.whenReady().then(async () => {
  // Windows: without a matching AppUserModelID the OS silently drops our toast
  // notifications. Must match the electron-builder appId + the NSIS shortcut.
  app.setAppUserModelId("com.capsuleers.intel");
  Menu.setApplicationMenu(null);  // removes the File/Edit/View… menu
  createWindow();
  // Intel mode is ON by default — start watching the clipboard immediately, unless the
  // user explicitly turned it off in a previous session. No consent prompt.
  if (watchEnabledPref()) startWatch(onScanDetected);
  createTray();       // tray menu reflects the current watch state
  setupAutoUpdate();  // checks for app updates in the background (only if packaged)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Custom window controls (app-style title bar).
ipcMain.on("win:minimize", () => win?.hide());                 // minimize → tray icon
ipcMain.on("win:maximize", () => { if (win?.isMaximized()) win.unmaximize(); else win?.maximize(); });
ipcMain.on("win:close", () => { app.isQuitting = true; app.quit(); });
ipcMain.on("win:mini", () => enterMini());                     // shrink to always-on-top icon
ipcMain.on("win:restore", () => exitMini());
// Header-fit minimum width, measured by the renderer. Clamped to the screen.
ipcMain.on("win:set-min-width", (_e, w) => {
  if (!win || win.isDestroyed()) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const minW = Math.min(Math.max(MIN_WIDTH, Math.round(Number(w) || 0)), wa.width);
  const minH = Math.min(560, wa.height);
  normalMinSize = { w: minW, h: minH };
  if (prevBounds) return;                       // in mini-mode: defer until exitMini restores it
  win.setMinimumSize(minW, minH);
  if (win.isMaximized()) return;                // don't shrink a maximized window
  const b = win.getBounds();
  if (b.width < minW) win.setSize(minW, Math.max(b.height, minH));
});
ipcMain.handle("clipboard:write", (_e, text) => { clipboard.writeText(String(text ?? "")); return true; });

// Local intel from clipboard: the renderer can drive the toggle and the scan,
// and re-confirm the last detected Local.
ipcMain.handle("local:toggle", () => { toggleClipboardWatch(); return isEnabled(); });
ipcMain.handle("local:state", () => isEnabled());
ipcMain.on("local:scan", () => scanClipboardNow());
ipcMain.on("local:confirm", () => { if (pendingLocal) runScan(pendingLocal); });
// Intel detail for a single pilot (popup on clicking the row).
ipcMain.handle("local:detail", async (_e, who) => {
  try { return await characterDetail(who || {}); } catch (e) { return { error: e.message }; }
});

// Share the last resolved Local intel: POST the resolved character IDs to
// capsuleers.app (which recomputes the canonical snapshot), copy the returned
// link to the clipboard, and record it in the on-disk history.
ipcMain.handle("local:share", async () => {
  const ids = (lastLocalResult?.rows || []).map((r) => r.id).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return { error: "no-pilots" };
  try {
    const share = await sharePilotIntel(ids);   // { id, url, expiresAt, pilotCount }
    try { clipboard.writeText(share.url); } catch { /* clipboard busy */ }
    try { await addShareHistory({ ...share, kind: "intel", count: share.pilotCount }); } catch { /* history non-critical */ }
    return { ...share, copied: true };
  } catch (e) {
    return { error: e.message };
  }
});
// Share the last analyzed D-Scan: POST the raw rows to capsuleers.app (which
// recomputes the full resolution), copy the link, record it in the same history.
ipcMain.handle("dscan:share", async () => {
  const rows = lastDScanRows || [];
  if (!rows.length) return { error: "no-dscan" };
  try {
    const share = await shareDScan(rows);   // { id, url, expiresAt, objectCount }
    try { clipboard.writeText(share.url); } catch { /* clipboard busy */ }
    try { await addShareHistory({ ...share, kind: "dscan", count: share.objectCount }); } catch { /* history non-critical */ }
    return { ...share, copied: true };
  } catch (e) {
    return { error: e.message };
  }
});
// Share-link history (disk-persisted, expired links pruned on read).
ipcMain.handle("local:history:list", async () => { try { return await listShareHistory(); } catch { return []; } });
ipcMain.handle("local:history:clear", async () => { try { await clearShareHistory(); } catch { /* */ } return true; });
