# Capsuleers.Intel

**Capsuleers.Intel** — a **standalone, cross-platform** desktop **intel tool** for
**EVE Online**. Copy your **Local** roster or a **D-Scan** and it tells you, at a glance,
**who you're up against** and **how the hostile fleet is composed**.

It is the **Intel-only** sibling of [**Capsuleers.IA**](https://github.com/WilliamFalci/capsuleers.ia):
same clipboard intel features, same look — **without** the local AI assistant, the language
models or the RAG knowledge index. So the download is **tens of MB instead of gigabytes**, with
nothing to set up on first launch.

> Want the AI assistant too (skills, fitting, wormholes, PvE… answered with cited sources)?
> Get **Capsuleers.IA**, which bundles both the AI and these Intel features.

## Features

- **Local intel** — copy EVE's Local window (`Ctrl+A`, `Ctrl+C`) and get a per-pilot roster:
  kills / losses / efficiency, danger rating, archetype tags and a per-pilot **dossier**
  (playstyle, frequent wingmates, recently used ships) from [eve-kill](https://eve-kill.com).
- **D-Scan analysis** — copy a D-Scan and get the composition broken down **by ship class**,
  computed **100% offline** from the bundled [eve-fit-engine](https://www.npmjs.com/package/eve-fit-engine)
  SDE (the system is inferred from celestial names).
- **Share** — turn any intel or D-Scan into a shareable, full-fidelity link (valid 24h) on
  [capsuleers.app](https://capsuleers.app); the Site recomputes the canonical payload so the
  shared page is richer than the local snapshot. Generated links live in the **History** modal
  with a live countdown.
- **Clipboard watch** — an opt-in background watcher detects a Local or a D-Scan the moment you
  copy it (with an audible cue), so it keeps working while you play fullscreen on another monitor.
- **Mini mode** — shrink to an always-on-top icon; minimize to the system tray.

Nothing leaves your machine except the lookups the features explicitly need: pilot names →
eve-kill for Local intel, item type IDs already resolved offline, and the raw scan → capsuleers.app
**only when you press Share**. D-Scan analysis is fully offline.

## Run from source

Requires Node.js (a recent LTS) on Windows or Linux.

```bash
cd desktop
npm install
npm start                 # launches the app
```

## Build installers

```bash
cd desktop
npm run dist:linux        # Linux AppImage
npm run dist:win          # Windows NSIS installer (build on Windows)
npm run pack              # unpacked folder, for quick testing
```

Builds publish to GitHub Releases (electron-updater handles in-app auto-update). For a local
build that doesn't publish, the `dist:*` scripts already pass `--publish never`.

### Continuous build & releases (GitHub Actions)

[`.github/workflows/build.yml`](.github/workflows/build.yml) runs automatically:

- **Every push / merge to `main`** → builds the Linux AppImage + Windows NSIS installer on their
  native runners and uploads them as downloadable **workflow artifacts** (no release is published).
- **Pushing a version tag `vX.Y.Z`** → builds AND publishes a **GitHub Release** with the installers
  + `latest*.yml` update manifests (this is what electron-updater consumes). Cut a release with:

  ```bash
  cd desktop && npm version patch   # bumps desktop/package.json, creates the commit + vX.Y.Z tag
  git push && git push --tags
  ```

No secrets to configure: the workflow uses the built-in `GITHUB_TOKEN`.

## Architecture

Electron app, entry point [`desktop/src/main.mjs`](desktop/src/main.mjs). No server, no database,
no native modules.

| Module | Role |
|---|---|
| [`intel.mjs`](desktop/src/intel.mjs) | Local roster intel (`localIntel`), per-pilot detail (`characterDetail`), offline D-Scan composition (`analyzeDScan`), and the share helpers (`sharePilotIntel` / `shareDScan`). |
| [`mcp-intel.mjs`](desktop/src/mcp-intel.mjs) | Per-pilot **dossier** enrichment (`dossierExtra`, `characterCard`) via the eve-kill MCP server. |
| [`mcp.mjs`](desktop/src/mcp.mjs) | eve-kill MCP transport (`callTool`). |
| [`prices.mjs`](desktop/src/prices.mjs) | EVE Ref reference prices (live fetch; `priceByTypeId`). |
| [`intel-history.mjs`](desktop/src/intel-history.mjs) | Disk-persisted history of generated share links (24h, pruned on read). |
| [`clipboard-watch.mjs`](desktop/src/clipboard-watch.mjs) | Opt-in clipboard watcher; discriminates Local vs D-Scan. |
| [`user-agent.mjs`](desktop/src/user-agent.mjs) | Single source of truth for the outbound `User-Agent`. |
| [`renderer/index.html`](desktop/src/renderer/index.html) | The whole UI (window chrome, Local/D-Scan/History panels, pilot drawer). |

The fitting/SDE math is delegated to the [`eve-fit-engine`](https://www.npmjs.com/package/eve-fit-engine)
npm package, which ships its own version-pinned, Pyfa-parity SDE bundle.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev flow and [CLAUDE.md](CLAUDE.md) for an
architecture brief.

## Disclaimer

**Unofficial tool** made by fans — not affiliated with nor endorsed by Fenris Creations.
EVE Online and the EVE logo are registered trademarks of Fenris Creations. All rights reserved.
See [THIRD_PARTY.md](THIRD_PARTY.md). Source code is MIT (see [LICENSE](LICENSE)). Always verify
in-game.
