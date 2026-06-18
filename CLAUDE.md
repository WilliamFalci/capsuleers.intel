# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

**Capsuleers.Intel** — a standalone, cross-platform (Windows + Linux) Electron desktop **intel
tool** for **EVE Online**. It does two things from the clipboard: **Local roster intel** (per-pilot
eve-kill stats + dossier) and **offline D-Scan composition** analysis, plus 24h **share links** on
capsuleers.app and a link **history**.

It is the **Intel-only** sibling of **Capsuleers.IA**: same clipboard intel features and visual
style, but **without** the local LLM (`node-llama-cpp`), the GGUF models or the RAG index. The
two are **separate, independent repos** — Intel was extracted by copying only the modules its
features need; it has no shared package or submodule with IA, and IA is never modified from here.

At runtime the app needs **no downloads and no setup**: every feature is either offline (D-Scan
via the bundled `eve-fit-engine` SDE) or a live public-API lookup (eve-kill, EVE Ref). The
installer is code-only (tens of MB).

## Commands

```bash
cd desktop
npm install
npm start              # dev
npm run dist:linux     # Linux AppImage
npm run dist:win       # Windows NSIS installer (build on Windows)
npm run pack           # unpacked folder (quick testing)
```

## Architecture

Electron, entry [`desktop/src/main.mjs`](desktop/src/main.mjs). No server, no DB, **no native
modules** (so a single `electron-builder.yml` covers both OSes — there are no per-GPU CUDA/Vulkan
variants like IA has).

### Module map (`desktop/src/`)

- [`main.mjs`](desktop/src/main.mjs) — Electron main process: frameless window + window-state
  persistence, tray, **mini mode** (always-on-top icon), the clipboard-watch wiring
  (consent dialog → detect → confirm → run), the `local:*` / `dscan:*` / share / history IPC, and
  electron-updater **app** auto-update. **No** engine/model/setup code.
- [`preload.cjs`](desktop/src/preload.cjs) — context bridge exposing `capsuleers.{clipboard, win, local}`.
- [`renderer/index.html`](desktop/src/renderer/index.html) — the entire UI in one file (CSS theme +
  HTML + script). Contains the window chrome, the **home** panel, the Local / D-Scan / History
  overlays, the pilot detail drawer, and the bilingual (IT/EN, auto from system locale) i18n
  dictionary. The home panel replaces IA's chat surface. The Local panel renders a summary strip
  (`#local-summary`, built by `aggregateLocal` / `renderLocalSummary`) above the pilot list:
  alliance / corporation / pilot totals plus a chip per detected alliance (logo + name + count).
- [`intel.mjs`](desktop/src/intel.mjs) — `localIntel` (per-pilot eve-kill intel for a Local
  roster), `characterDetail` (drawer dossier), `analyzeDScan` (offline composition via the
  bundled `eve-fit-engine` SDE), `sharePilotIntel` / `shareDScan` (POST to capsuleers.app, 24h link).
- [`mcp-intel.mjs`](desktop/src/mcp-intel.mjs) — **only** `dossierExtra` + `characterCard` (the
  per-pilot dossier from the eve-kill MCP server). IA's large natural-language MCP analytics
  dispatcher (`maybeMcp`, doctrine specs, battles, flies-with…) was **intentionally dropped** —
  it lived behind the AI chat. This is why `fit.mjs` and `eveworkbench.mjs` are NOT in this repo.
- [`mcp.mjs`](desktop/src/mcp.mjs) — eve-kill MCP transport (`callTool`).
- [`prices.mjs`](desktop/src/prices.mjs) — EVE Ref reference prices. Only `priceByTypeId` is used
  (live everef fetch); `names_index.json` / `priceByName` are never invoked, so **no data file is
  needed**.
- [`intel-history.mjs`](desktop/src/intel-history.mjs) — disk-persisted share-link history
  (`{userData}/intel-share-history.json`, `kind: 'intel'|'dscan'`, pruned past 24h on read).
- [`clipboard-watch.mjs`](desktop/src/clipboard-watch.mjs) — opt-in watcher; `detectClipboard`
  discriminates a Local roster from a D-Scan and returns a discriminated payload. Clipboard reads
  go through `readClipboardText()`: on Linux Wayland (`WAYLAND_DISPLAY` set) it shells out to
  `wl-paste -n` (Electron's `clipboard.readText()` only returns fresh content while the window is
  focused on Wayland, so background copies would be missed); it falls back to Electron's clipboard
  on other platforms, or permanently if `wl-paste` is `ENOENT` (wl-clipboard not installed).
- [`user-agent.mjs`](desktop/src/user-agent.mjs) — single source of truth for the outbound
  `User-Agent` (`Capsuleers.Intel/<version> (+https://capsuleers.app; info@capsuleers.app)`,
  version from `package.json`). Every external fetch imports it.

### IPC surface

`local:*` (toggle/state/scan/confirm/detail/share + history), `dscan:share`, `clipboard:write`,
`win:*` (minimize/maximize/close/mini/restore/set-min-width). Plus the renderer-bound events
`local:detected|start|progress|result`, `dscan:start|result`, `win:state|mini-state`.

### Fit / SDE

All fitting and SDE math is delegated to the **[`eve-fit-engine`](https://www.npmjs.com/package/eve-fit-engine)**
npm package (Pyfa-parity, version-pinned SDE). **Trap:** `eve-fit-engine/data/**` MUST be
`asarUnpack`'d in `electron-builder.yml` — the package's `/node` loader reads its SDE from disk
via `fs`, which fails inside `app.asar`.

## Relationship to the other repos

- **Capsuleers.IA** — the AI + Intel app. Source of the modules copied here. **Never modified.**
- **Capsuleers.Site** (`capsuleers.app`) — hosts the share endpoints
  (`/api/pilot-intel/shares/from-scan`, `/api/scans/from-dscan`, anonymous / no-Origin) that
  the Share buttons POST to. No Site changes are required for this app.

## Notes

- Outbound `User-Agent` must always be the `user-agent.mjs` constant — don't hardcode a string.
- The app is bilingual via the system locale only (no in-app language switch), like IA.
