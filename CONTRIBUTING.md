# Contributing to Capsuleers.Intel

Thanks for helping! This is a small, focused Electron app — the **Intel-only** sibling of
Capsuleers.IA. Keep changes scoped to the clipboard intel features (Local roster, D-Scan, share,
history). If a change belongs to the AI assistant, it belongs in **Capsuleers.IA**, not here.

## Dev setup

Node.js (recent LTS), Windows or Linux.

```bash
cd desktop
npm install
npm start
```

There is no build step for the renderer — it's a single `index.html` (CSS + HTML + script). Edit
and restart `npm start`.

## Project layout

See [CLAUDE.md](CLAUDE.md) for the full module map. In short:

- `desktop/src/main.mjs` — Electron main (window/tray/mini, clipboard-watch, IPC, auto-update).
- `desktop/src/preload.cjs` — the `capsuleers.*` bridge.
- `desktop/src/renderer/index.html` — the whole UI.
- `desktop/src/{intel,mcp-intel,mcp,prices,intel-history,clipboard-watch,user-agent}.mjs` — feature modules.

## Conventions

- **Outbound `User-Agent`**: every external `fetch` must send the constant from
  `desktop/src/user-agent.mjs`. Don't hardcode a UA string at a call site — change the contact or
  version in that one file. Keep the `Capsuleers.Intel/<version> (...)` format.
- **No AI / model / RAG code.** This repo deliberately has no `node-llama-cpp`, no GGUF models, no
  knowledge index, and no `fit.mjs` / `eveworkbench.mjs`. Don't reintroduce them — that scope is
  Capsuleers.IA's.
- **eve-fit-engine SDE must stay `asarUnpack`'d** (`electron-builder.yml`) — its `/node` loader
  reads the SDE from disk.
- **i18n**: UI strings live in the `I18N` dictionary inside `index.html` (IT + EN). Add both
  languages for any new visible string and reference it via `data-i18n*` or `L.<key>`.
- **Keep the docs in sync.** If you change commands, the module map, or the release flow, update
  `README.md`, `CLAUDE.md` and this file together.

## Building releases

```bash
cd desktop
npm run dist:linux     # AppImage
npm run dist:win       # NSIS (.exe), build on Windows
```

Releases are published to GitHub Releases (electron-updater consumes the `latest*.yml`). For a
local build that does not publish, the `dist:*` scripts already pass `--publish never`.

## Pull requests

- One focused change per PR.
- Test the affected flow manually (`npm start`): toggle the clipboard watch, copy a Local and a
  D-Scan, open a pilot dossier, create a share link and confirm it lands in History.
- Don't commit `node_modules/` or `dist/`.
