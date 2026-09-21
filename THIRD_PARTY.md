# Third-party data, services & licenses

Capsuleers.Intel is an **unofficial, fan-made** tool for EVE Online, not affiliated with nor
endorsed by Fenris Creations. Source code is MIT (see [LICENSE](LICENSE)).

## EVE Online IP

> EVE Online and the EVE logo are the registered trademarks of Fenris Creations. All rights
> are reserved worldwide. All other trademarks are the property of their respective
> owners. EVE Online, the EVE logo, EVE and all associated logos and designs are
> the intellectual property of Fenris Creations. All artwork, screenshots, characters,
> vehicles, storylines, world facts or other recognizable features of the
> intellectual property relating to these trademarks are likewise the intellectual
> property of Fenris Creations.
>
> Fenris Creations has granted permission to Capsuleers.Intel to use EVE Online and all
> associated logos and designs for promotional and information purposes on its
> website but does not endorse, and is in no way affiliated with,
> Capsuleers.Intel. Fenris Creations is in no way responsible for the content on or
> functioning of this software, nor can it be liable for any damage arising from the
> use of this software.

Character portraits, corporation/alliance logos and item icons are served from CCP's
official image server (`images.evetech.net`). Static game data is used under the EVE
Online Developer License Agreement.

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
