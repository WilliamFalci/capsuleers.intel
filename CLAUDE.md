# capsuleers.intel

App desktop Electron (Windows + Linux) per EVE Online: intel sul roster Local e analisi D-Scan
offline dagli appunti, link di share 24h su capsuleers.app e storico link. Sorella "solo intel" di
capsuleers.ia (niente LLM/RAG). Nessun server, DB o modulo nativo; nessun download a runtime.
Percorsi relativi a questa cartella; per regole di orchestrazione vedi `../CLAUDE.md`.

## Comandi
```bash
cd desktop && npm install
npm start              # dev
npm run pack           # cartella non pacchettizzata (test rapido)
npm run dist:linux     # AppImage
npm run dist:win       # installer NSIS (build su Windows)
node desktop/tools/verify-intel-backend.mjs   # verifica live del backend intel (dalla root; --fallback per eve-kill)
```
Nessuna suite di test.

## Vincoli
- `User-Agent` in uscita sempre dalla costante di `desktop/src/user-agent.mjs`, mai stringhe a mano.
- `eve-fit-engine/data/**` deve restare in `asarUnpack` (`electron-builder.yml`): il loader legge l'SDE da disco.
- `desktop/src/capsuleers-api.mjs` è identico a quello di capsuleers.ia: modifiche in entrambi; ia non si tocca da qui.
- Sicurezza da non regredire: renderer sandbox + contextIsolation, `esc()` quote-safe, CSP, fuses,
  consenso privacy prima di appunti e rete (dettaglio in security.md).
- Bilingue IT/EN solo da locale di sistema, nessuno switch in app.
- Icone: non modificarle né generarle qui (vedi brand.md).

## Aree (leggi solo se il task le tocca)
| area | file | leggi se |
|---|---|---|
| architettura | docs/claude/architecture.md | tocchi moduli `desktop/src/`, IPC, flussi Local/D-Scan/share, SDE |
| sicurezza | docs/claude/security.md | tocchi renderer, preload, CSP, packaging/fuses, consenso, rete |
| marchio | ../docs/claude/brand.md | tocchi icone o `docs/brand/` |
| rapporti tra repo | ../docs/claude/cross-repo.md | tocchi API v1 del sito, share o file copiati da ia |
