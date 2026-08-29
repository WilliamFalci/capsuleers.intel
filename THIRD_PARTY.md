# Third-party data, services & licenses

Capsuleers.Intel is an **unofficial, fan-made** tool for EVE Online, not affiliated with nor
endorsed by Fenris Creations. Source code is MIT (see [LICENSE](LICENSE)).

## EVE Online IP

EVE Online, the EVE logo, and all related intellectual property are the property of
**Fenris Creations**. Character portraits, corporation/alliance logos and item icons are served
from CCP's official image server (`images.evetech.net`). This application is provided "as is";
Fenris Creations is in no way responsible for it.

## Runtime services

| Service | Used for | Notes |
|---|---|---|
| **eve-kill** (`eve-kill.com`, REST + analitiche) | Per-pilot killboard stats + dossier for Local intel | Only pilot names/IDs are sent. |
| **EVE Ref** (`data.everef.net`) | Reference item prices | Live fetch, cached in-process. |
| **EVE Static Data Export / ESI** (Fenris Creations) | Source of the SDE used for D-Scan classification | Bundled offline inside `eve-fit-engine`. |
| **capsuleers.app** | Share endpoints (only when you press **Share**) | Recomputes the canonical shared payload. |

## Bundled packages

- **[eve-fit-engine](https://www.npmjs.com/package/eve-fit-engine)** — Pyfa-parity fitting engine
  + version-pinned SDE bundle. Used to classify D-Scan entities **offline**.
- **Electron**, **electron-builder**, **electron-updater** — app shell, packaging, auto-update.

No language models, no RAG knowledge index, and no EVE University Wiki / eve-survival / Anoikis
content are bundled or required (those belong to the AI-enabled sibling, Capsuleers.IA).
