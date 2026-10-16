# Sicurezza — capsuleers.intel

Leggi se tocchi renderer, preload, CSP, `electron-builder.yml` (fuses), consenso privacy o le chiamate di rete.

Hardened 2026-06-29 — full write-up in [`docs/security-review-2026-06-29.md`](../security-review-2026-06-29.md). Intel's surface is a **subset** of IA's (no LLM / model-output rendering), so the IA answer-rendering XSS doesn't exist here; the shared invariants still apply. **Don't regress:**

- **Renderer is sandboxed + isolated.** `webPreferences` sets `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` explicitly. No `<webview>`. A renderer XSS can't reach Node — only the narrow `preload.cjs` bridge.
- **`esc()` must stay quote-safe** (`& < > " '`): values land inside `title="…"` attributes, so the quote escapes prevent an attribute-breakout XSS.
- **CSP `<meta>` in `renderer/index.html`** — `connect-src 'self'` contains exfiltration (no direct renderer network — all egress via IPC); `img-src` pinned to `images.evetech.net`. Widen only the matching directive if you add a fetch/CDN.
- **Electron fuses** via `electronFuses:` in `electron-builder.yml` (`runAsNode` etc. off, `onlyLoadAppFromAsar` on; `enableEmbeddedAsarIntegrityValidation` off pending a tested Windows build).
- **`data:wipe-all` shows a main-process confirmation** before wiping (`wipe*` keys in `MSTR`).
- **No hidden egress** — pilot names go to ESI and capsuleers.app for Local intel (eve-kill only as a
  fallback), scans to capsuleers.app only on Share. No telemetry, no LLM.
- **The privacy notice gates the clipboard AND the network** (`ensureConsent` in `main.mjs`,
  `privacy-consent.json` in userData, versioned by `CONSENT_VERSION`). It runs at launch before the
  watch starts, when the watch is turned on from the tray/button, and inside `runLocalIntel` — the
  tray's "scan now" reaches the network without the watch, so gating only the watch is not enough.
  **"Not now" is the default button**: consent is an explicit click on "Enable", never an Enter on
  autopilot. "Not now" persists the watch OFF, so the notice is not repeated at every launch. Until
  0.1.18 there was NO notice at all (the watch started on first launch) while these docs claimed one;
  an upgraded install sees it once. Bump `CONSENT_VERSION` whenever the set of contacted services
  changes. The per-scan confirmation also names where the pilot names go.
