# Security review — Capsuleers.Intel desktop app (2026-06-29)

**Scope:** `desktop/` (Electron app + IPC + renderer). Triggered by a third-party
"adversarial AI" report (delivered against the Capsuleers.IA / Capsuleers.Intel pair)
claiming *"unsanitized inputs and exfiltration / local code execution from suitably
corrupted prompts."*
**Method:** static read of the Electron config, the `preload` context bridge, the
clipboard ingestion path, the renderer rendering code, the IPC handlers, and the build
config.
**Reviewer:** internal (Claude-assisted), William Peter Falci.

**Status:** all findings below are now **fixed** in the working tree (one with a documented
follow-up — see I3). Packaged builds should be smoke-tested before release.

> **Note on the claim's framing.** Capsuleers.Intel is the **Intel-only** sibling of
> Capsuleers.IA: it has **no local LLM, no model output, no `mdToHtml`**. The report's
> "corrupted prompt" angle is therefore largely **not applicable here** — there is no AI
> answer surface to prompt-inject. What *does* carry over is the shared rendering code and
> Electron configuration, reviewed below.

---

## Verdict on the external claim

| Claim | Assessment (for Intel) |
|---|---|
| "Unsanitized inputs" | **Mostly false here.** Clipboard rosters are charset-restricted at parse; D-Scan and eve-kill data are rendered with `esc()`. One latent gap: `esc()` did not encode quotes, so a hostile value reaching an HTML *attribute* could break out. Hardened. |
| "Exfiltration … from corrupted prompts" | **Not applicable / contained.** No LLM, no hidden egress; network is disclosed and consented. Exfiltration was only *theoretically* possible via an attribute-XSS with no CSP — both now closed. |
| "**Local code execution** (RCE)" | **Not reproducible / overstated.** No `exec`/`eval`/native sink reachable from the renderer; Electron `sandbox` + `contextIsolation` + a narrow bridge confine any renderer compromise to the Chromium sandbox. (Packaged-binary fuses — the one real local-code-execution hardening item — are now wired; see I3.) |

**Bottom line:** Intel's attack surface is a strict subset of IA's (no AI answer
rendering), so the most serious IA finding does not exist here. All applicable findings are
now remediated.

---

## Findings

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| I1 | `esc()` unsafe in attribute contexts (latent attribute-breakout XSS) | Low | ✅ Fixed |
| I2 | No Content-Security-Policy → unconstrained exfiltration if XSS occurs | **Medium** | ✅ Fixed |
| I3 | Electron fuses declared but not wired into the build (`RunAsNode` etc. at default) | Low–Medium | ✅ Fixed¹ |
| I4 | `data:wipe-all` (destructive) bridged with no main-side confirmation | Low | ✅ Fixed |

¹ Fuses are now wired via electron-builder's `electronFuses`; `enableEmbeddedAsarIntegrityValidation`
is intentionally left OFF until a packaged Windows build is smoke-tested with it on (see I3).

---

### I1 — `esc()` unsafe in attribute contexts — Low — ✅ Fixed

**Where:** `desktop/src/renderer/index.html` — `esc()`.

**Root cause:** `esc()` encoded `&`, `<`, `>` but **not** `"`/`'`. The renderer places
`esc()`'d values inside double-quoted attributes (e.g. `title="${esc(name)}"` on alliance/
corp logos, ship rows, pilot drawer). A value containing a literal `"` could break out of
the attribute and inject another attribute (e.g. an event handler).

**Why severity is Low here:** the values that reach those attributes are EVE entity names
from eve-kill/ESI (TLS, CCP-restricted charset → no `"`) and SDE-resolved D-Scan names.
There is no model-output channel (unlike IA) to inject an arbitrary string, so this was a
**latent** weakness rather than a readily reachable one.

**Fix applied:** `esc()` now also encodes `"` → `&quot;` and `'` → `&#39;`, making it safe
in both element-content and attribute contexts.

---

### I2 — No Content-Security-Policy — **Medium** — ✅ Fixed

**Where:** `desktop/src/renderer/index.html` (`<head>`).

**Root cause:** the renderer document had no CSP, so any XSS would have had unrestricted
`connect-src` (exfiltration via `fetch`) and could beacon via remote `<img>`.

**Fix applied:** a strict `<meta http-equiv="Content-Security-Policy">`:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' https://images.evetech.net data:; connect-src 'self'; font-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'
```

**Design notes:**
- The renderer makes **no** direct network requests (all egress is via IPC → main), so
  `connect-src 'self'` breaks nothing yet **contains exfiltration**.
- `img-src` is pinned to the only image CDN actually loaded (`images.evetech.net`); the
  other referenced hosts (`eve-kill.com`, `capsuleers.app`) are anchor `href`s opened in
  the system browser, not page resources.
- `'unsafe-inline'` is required by the app's own inline `<script>`/styles and does not
  weaken the exfil containment.

---

### I3 — Electron fuses not wired into the build — Low–Medium — ✅ Fixed¹

**Was:** `@electron/fuses` was a `devDependency` with **no** config to flip them, so
packaged binaries kept default fuses (notably `RunAsNode` enabled). Not prompt/remote-
triggerable, but the only item touching real "local code execution" (a local attacker
setting env + relaunching the binary as Node).

**Fix applied:** an `electronFuses` block in `electron-builder.yml` (electron-builder 26
flips fuses at pack time and re-signs as needed):

```yaml
electronFuses:
  runAsNode: false
  enableCookieEncryption: true
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false
  enableEmbeddedAsarIntegrityValidation: false
  onlyLoadAppFromAsar: true
```

**¹ Follow-up (documented, intentional):** `enableEmbeddedAsarIntegrityValidation` is left
`false` until a packaged Windows build is smoke-tested with it on (a header mismatch can
block launch on Windows; it is a no-op on the Linux AppImage). Flip to `true`, build + launch
the Windows installer once, keep it on if it starts cleanly.

---

### I4 — `data:wipe-all` bridged without main-side confirmation — Low — ✅ Fixed

**Was:** `preload.cjs` exposes `data.wipeAll()` → `ipcMain.handle("data:wipe-all", …)` which
deletes all app data (clipboard state, share history, caches) and quits, with confirmation
only in the renderer UI. An XSS could call it directly.

**Fix applied:** the handler now shows a main-process `dialog.showMessageBox` (warning,
Cancel default) and aborts unless the user confirms. New i18n keys `wipeTitle/wipeMsg/
wipeDetail/wipeConfirm` (it + en) back the dialog.

---

## Defences confirmed (already correct — do not regress)

- **Electron 42 secure defaults**, now also **set explicitly** in `webPreferences`
  (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`). No `<webview>`, no
  remote module.
- **Narrow context bridge** (`preload.cjs`): fixed-channel methods only; no `fs`/`shell`/
  `child_process`, no generic `invoke(channel)`. (Smaller than IA's — no model/engine IPC.)
- **Clipboard read via `execFileSync("wl-paste", ["-n"])`** — argument array, no shell →
  no command injection.
- **Local-roster names sanitized at the source** (`clipboard-watch.mjs` `NAME_RE`): only
  letters/digits/space/apostrophe/dot/hyphen; lines with `<>{}[]|=;:/@` are discarded.
- **D-Scan and eve-kill rendering fully `esc()`'d**; image `src` uses numeric IDs.
- **Navigation locked down**: `setWindowOpenHandler → deny`, `will-navigate` prevented,
  only `^https?://` to the system browser.
- **No hidden egress** — eve-kill/ESI lookups are explicitly consented; capsuleers.app is
  hit only on an explicit Share click. No telemetry, no LLM.

---

## Change log (this review)

- `desktop/src/renderer/index.html` — hardened `esc()` (encode `"`/`'`); added a strict CSP
  `<meta>` in `<head>`. (I1, I2)
- `desktop/electron-builder.yml` — added the `electronFuses` hardening block. (I3)
- `desktop/src/main.mjs` — explicit `sandbox/contextIsolation/nodeIntegration` in
  `webPreferences`; main-process confirmation dialog on `data:wipe-all` + four new i18n keys
  (it/en). (I3, I4)

## Remaining / recommended

1. **I3 follow-up** — set `enableEmbeddedAsarIntegrityValidation: true` and verify a packaged
   Windows install launches before relying on it.
2. **Optional** — externalize the inline `<script>`/`<style>` so `script-src` can drop
   `'unsafe-inline'` and block inline event handlers outright.
3. **Smoke-test** — launch the app, paste a Local roster and a D-Scan, confirm pilot rows,
   portraits (evetech images), the drawer, external links and the wipe-all dialog all work
   under the new CSP + fuses.
