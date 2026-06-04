# Security Policy

## Supported versions

Capsuleers.Intel ships as a single rolling desktop app and auto-updates via
electron-updater. **Only the latest GitHub Release is supported.** Please make
sure you are on the most recent version before reporting an issue — older builds
are not patched.

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.**

Report privately, through either channel:

- **GitHub Security Advisories** — use the
  [*Report a vulnerability*](https://github.com/WilliamFalci/capsuleers.intel/security/advisories/new)
  button on this repository (preferred).
- **Email** — [info@capsuleers.app](mailto:info@capsuleers.app).

Please include:

- a description of the issue and its impact,
- the app version and OS (Windows / Linux),
- steps to reproduce or a proof of concept,
- any relevant logs (scrub personal data first).

We aim to acknowledge a report within **72 hours** and to provide a remediation
plan or fix timeline within **7 days**. Coordinated disclosure is appreciated:
please give us a reasonable window to ship a fix before any public write-up.

## Scope

This is a desktop intel tool for EVE Online. Things especially worth reporting:

- remote code execution or arbitrary file access from a crafted clipboard
  payload (Local roster / D-Scan input),
- issues in the Electron security posture (context isolation, the
  `capsuleers.*` preload bridge, navigation / `window.open` handling),
- weaknesses in the auto-update flow (electron-updater),
- leakage of data beyond what the app's features explicitly require.

### Out of scope

- Vulnerabilities in third-party services the app talks to
  ([eve-kill](https://eve-kill.com), [capsuleers.app](https://capsuleers.app))
  — report those to the respective project. See [THIRD_PARTY.md](THIRD_PARTY.md).
- Reports requiring a compromised local machine or physical access.
- Missing best-practice hardening with no demonstrable impact.

## Data handling

Capsuleers.Intel is local-first. Nothing leaves your machine except the lookups
a feature explicitly needs: pilot names → eve-kill for Local intel, and the raw
scan → capsuleers.app **only when you press Share** (links expire after 24h).
D-Scan analysis runs fully offline. See the [README](README.md) for details.
