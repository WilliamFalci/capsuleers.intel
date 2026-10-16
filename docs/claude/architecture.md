# Architettura — capsuleers.intel

Leggi se tocchi moduli di `desktop/src/`, IPC, flussi Local/D-Scan/share o il packaging dell'SDE.
Percorsi relativi alla root del repo. La tabella moduli del README è un duplicato sintetico (per umani) di questa pagina.

## Panoramica
**Capsuleers.Intel** — a standalone, cross-platform (Windows + Linux) Electron desktop **intel
tool** for **EVE Online**. It does two things from the clipboard: **Local roster intel** (per-pilot
stats + dossier from capsuleers.app) and **offline D-Scan composition** analysis, plus 24h **share links** on
capsuleers.app and a link **history**.

It is the **Intel-only** sibling of **Capsuleers.IA**: same clipboard intel features and visual
style, but **without** the local LLM (`node-llama-cpp`), the GGUF models or the RAG index. The
two are **separate, independent repos** — Intel was extracted by copying only the modules its
features need; it has no shared package or submodule with IA, and IA is never modified from here.

At runtime the app needs **no downloads and no setup**: every feature is either offline (D-Scan
via the bundled `eve-fit-engine` SDE) or a live public-API lookup (capsuleers.app, ESI; eve-kill only
as a fallback). The
installer is code-only (tens of MB).

## Architecture

Electron, entry [`desktop/src/main.mjs`](../../desktop/src/main.mjs). No server, no DB, **no native
modules** (so a single `electron-builder.yml` covers both OSes — there are no per-GPU CUDA/Vulkan
variants like IA has).

### Module map (`desktop/src/`)

- [`main.mjs`](../../desktop/src/main.mjs) — Electron main process: frameless window + window-state
  persistence, tray, **mini mode** (always-on-top icon), the clipboard-watch wiring
  (privacy notice → detect → confirm → run), the `local:*` / `dscan:*` / share / history IPC, and
  electron-updater **app** auto-update. **No** engine/model/setup code.
- [`preload.cjs`](../../desktop/src/preload.cjs) — context bridge exposing `capsuleers.{clipboard, win, local}`.
- [`renderer/index.html`](../../desktop/src/renderer/index.html) — the entire UI in one file (CSS theme +
  HTML + script). Contains the window chrome, the **home** panel, the Local / D-Scan / History
  overlays, the pilot detail drawer, and the bilingual (IT/EN, auto from system locale) i18n
  dictionary. The home panel replaces IA's chat surface. The Local panel renders a summary strip
  (`#local-summary`, built by `aggregateLocal` / `renderLocalSummary`) above the pilot list:
  alliance / corporation / pilot totals plus a chip per detected alliance (logo + name + count).
- [`capsuleers-api.mjs`](../../desktop/src/capsuleers-api.mjs) — **capsuleers.app is the intel backend**,
  through the site's public API v1 (`/api/v1/…`, contract in the site's `shared/api-v1.ts`: stable paths
  and shapes, rate-limited per IP, 404 "no such entity" apart from 503 "upstream unwell"). The SAME file
  as capsuleers.ia's — keep the two in step. Every v1 response carries `X-Capsuleers-Api`; without it the
  deployed site predates v1 and the call is retried on the legacy route (`apiFamily()`). Every call
  returns `null` on any failure and the caller falls back to eve-kill direct.
- [`intel.mjs`](../../desktop/src/intel.mjs) — mirrors the Local + drawer paths of capsuleers.ia's
  `intel.mjs`. `localIntel`: ESI `/universe/ids` for every name (one request), ONE site scan for every
  pilot, ESI bulk affiliations — a 62-name Local in ~1 s vs ~32 s through eve-kill (3 calls per pilot,
  still the fallback path). Its numbers are the **last 90 days** of the site's archive (`window: 90`,
  "90g" in the UI), so the danger thresholds are 30/150 kills, not the lifetime 100/500; the scan's
  `efficiency` is a kill/loss COUNT ratio and is never shown as ISK efficiency. `characterDetail`:
  lifetime totals from the site's profile + 90-day intel. Plus `analyzeDScan` (offline, bundled
  `eve-fit-engine` SDE) and `sharePilotIntel` / `shareDScan` (POST to capsuleers.app, 24h link).
  Verified live by `node desktop/tools/verify-intel-backend.mjs` (and `CAPSULEERS_SITE=http://127.0.0.1:9
  … --fallback` for the eve-kill path).
  The eve-kill MCP dossier, the EVE Ref prices and the "chi e' X" chain were copied from IA but never
  reachable from this app's UI; they were removed (IA keeps them behind its AI chat).
- [`intel-history.mjs`](../../desktop/src/intel-history.mjs) — disk-persisted share-link history
  (`{userData}/intel-share-history.json`, `kind: 'intel'|'dscan'`, pruned past 24h on read).
- [`clipboard-watch.mjs`](../../desktop/src/clipboard-watch.mjs) — opt-in watcher; `detectClipboard`
  discriminates a Local roster from a D-Scan and returns a discriminated payload. Clipboard reads
  go through `readClipboardText()`: on Linux Wayland (`WAYLAND_DISPLAY` set) it shells out to
  `wl-paste -n` (Electron's `clipboard.readText()` only returns fresh content while the window is
  focused on Wayland, so background copies would be missed); it falls back to Electron's clipboard
  on other platforms, or permanently if `wl-paste` is `ENOENT` (wl-clipboard not installed).
- [`user-agent.mjs`](../../desktop/src/user-agent.mjs) — single source of truth for the outbound
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

## Rapporti con gli altri repo (vedi anche `../docs/claude/cross-repo.md` della cartella CAPSULEERS)

- **Capsuleers.IA** — the AI + Intel app. Source of the modules copied here. **Never modified.**
- **Capsuleers.Site** (`capsuleers.app`) — hosts the share endpoints
  (`/api/pilot-intel/shares/from-scan`, `/api/scans/from-dscan`, anonymous / no-Origin) that
  the Share buttons POST to. No Site changes are required for this app.
