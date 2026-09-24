// Live intel on the pilots of a Local, for the roster and the pilot drawer.
//
// Primary backend: capsuleers.app (see capsuleers-api.mjs, the site's public API
// v1) — its own killmail archive for the batch Local scan and the 90-day pilot
// intel, eve-kill's lifetime totals behind the site's cache. Names resolve through
// ESI. eve-kill.com is kept ONLY as the fallback when the site does not answer, and
// for names ESI cannot resolve exactly. Mirrors capsuleers.ia's desktop/src/intel.mjs
// (Local + drawer paths); the "chi e' X" chat intel lives only there.
import { USER_AGENT as UA } from "./user-agent.mjs";
import { loadBundledDataset } from "eve-fit-engine/node";
import * as site from "./capsuleers-api.mjs";

const BASE = "https://eve-kill.com/api";

// eve-kill REST — fallback only.
async function get(pathQ) {
  const r = await fetch(BASE + pathQ, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`eve-kill HTTP ${r.status}`);
  return r.json();
}

function parseId(hit) {
  const m = String(hit.id || "").match(/^(alliance|corporation|character)_(\d+)$/);
  return m ? { type: m[1], id: Number(m[2]) } : null;
}

// Names → ids via ESI /universe/ids: official, exact, case-insensitive, 499 names
// per request.
async function esiIds(names) {
  const uniq = [...new Map(names.map((n) => [n.trim().toLowerCase(), n.trim()])).values()].filter(Boolean);
  const out = { characters: [], corporations: [], alliances: [] };
  // /universe/ids rejects the WHOLE batch on a duplicate or an empty string.
  for (let i = 0; i < uniq.length; i += 499) {
    const r = await fetch("https://esi.evetech.net/latest/universe/ids/", {
      method: "POST", headers: { "content-type": "application/json", "User-Agent": UA },
      body: JSON.stringify(uniq.slice(i, i + 499)), signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`ESI ids ${r.status}`);
    const d = await r.json();
    for (const k of Object.keys(out)) out[k].push(...(d[k] || []));
  }
  return out;
}

// A ticker is 1-5 characters with no space. ESI cannot search tickers, and a short
// word is also often SOMEONE's name ("CONDI" is a pilot AND an alliance ticker): for
// such queries eve-kill's hits are merged in, so the disambiguation still offers both
// — as it did when eve-kill was the only search.
const TICKER_LIKE = /^[^\s]{1,5}$/;

// Pilot stats + intel: the site first (lifetime totals from its eve-kill cache, the
// 90-day intel from its own archive), eve-kill direct only for what the site did not
// return. { stats, intel, fromSite } — either half may be null.
async function pilotData(id) {
  const [prof, pi] = await Promise.all([site.entityProfile("character", id), site.pilotIntel(id)]);
  let stats = prof?.stats || null, intel = pi?.intel || null;
  const fromSite = !!(stats || intel);
  const [st, it] = await Promise.allSettled([
    stats ? null : get(`/characters/${id}/stats`),
    intel || pi ? null : get(`/characters/${id}/intel?days=90`),
  ]);
  stats ||= st.status === "fulfilled" ? st.value : null;
  intel ||= it.status === "fulfilled" ? it.value : null;
  return { stats, intel, fromSite };
}

// ── Group intel for a Local (list of names from the clipboard) ──────────────

// Affiliation (corp/alliance + ticker) via official ESI. In a fleet many
// pilots share the same corp/alliance: the cache avoids repeated requests.
const ESI = "https://esi.evetech.net/latest";
async function esiGet(p) {
  const r = await fetch(`${ESI}${p}${p.includes("?") ? "&" : "?"}datasource=tranquility`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`ESI ${r.status}`);
  return r.json();
}
const groupCache = new Map();   // "corporations:ID" / "alliances:ID" → {id,ticker,name}
async function groupInfo(kind, id) {
  if (id == null) return null;
  const key = `${kind}:${id}`;
  if (groupCache.has(key)) return groupCache.get(key);
  let info = null;
  try { const d = await esiGet(`/${kind}/${id}/`); info = { id, ticker: d.ticker || "", name: d.name || "" }; } catch { /* offline */ }
  groupCache.set(key, info);
  return info;
}
// Corp + alliance of a character (with ticker and id for the logos).
async function affiliation(charId) {
  let aff;
  try { aff = await esiGet(`/characters/${charId}/`); } catch { return {}; }
  const [corp, alliance] = await Promise.all([
    groupInfo("corporations", aff.corporation_id),
    aff.alliance_id ? groupInfo("alliances", aff.alliance_id) : null,
  ]);
  return { corp, alliance };
}

// Estimates the danger level (0=unknown · 1=low · 2=medium · 3=high) of a
// character from eve-kill data, to highlight dangerous pilots.
function dangerScore(stats, intel) {
  if (!stats && !intel) return 0;                 // no data → unknown
  let s = 1;                                       // has data → at least low
  const kills = stats?.kills || 0;
  const eff = stats?.isk_efficiency;
  if (kills >= 100 || (eff != null && eff >= 70) || intel?.is_logi) s = 2;   // medium
  const fc = intel?.fc?.likelihood;
  const fcHot = fc && fc !== "None" && fc !== "Low";
  if (intel?.capital_pilot || fcHot || kills >= 500 || (intel?.bait && intel.bait !== "None")) s = 3; // high
  return s;
}

// Resolves a single character by exact name → ID: ESI first (exact), eve-kill's
// fuzzy search only if ESI does not know the name.
async function charIdByName(name) {
  try {
    const d = await esiIds([name]);
    if (d.characters[0]) return { id: d.characters[0].id, name: d.characters[0].name };
  } catch { /* ESI down: try eve-kill */ }
  let hits;
  try { hits = (await get(`/search?q=${encodeURIComponent(name)}&limit=5`)).hits || []; } catch { return null; }
  const hit = hits.find((h) => /^character_/.test(String(h.id))) || null;
  if (!hit) return null;
  const pid = parseId(hit);
  return pid ? { id: pid.id, name: hit.name } : null;
}

// Concise summary card of a character for the Local table.
// Returns { name, id, danger, kills, losses, eff, flags[], found }.
async function characterRow(name) {
  const idn = await charIdByName(name);
  if (!idn) return { name, id: null, danger: 0, kills: null, losses: null, eff: null, flags: [], found: false };
  const [st, it, aff] = await Promise.allSettled([
    get(`/characters/${idn.id}/stats`),
    get(`/characters/${idn.id}/intel?days=90`),
    affiliation(idn.id),
  ]);
  const stats = st.status === "fulfilled" ? st.value : null;
  const intel = it.status === "fulfilled" ? it.value : null;
  const { corp = null, alliance = null } = aff.status === "fulfilled" ? aff.value : {};
  const flags = [];
  if (intel?.capital_pilot) flags.push("capital");
  if (intel?.is_logi) flags.push("logi");
  if (intel?.fc?.likelihood && intel.fc.likelihood !== "None") flags.push("FC:" + intel.fc.likelihood);
  if (intel?.bait && intel.bait !== "None") flags.push("bait");
  if (intel?.dominant_style) flags.push(intel.dominant_style);
  return {
    name: idn.name, id: idn.id,
    danger: dangerScore(stats, intel),
    kills: stats?.kills ?? null,
    losses: stats?.losses ?? null,
    eff: stats?.isk_efficiency ?? null,
    flags,
    corpId: corp?.id ?? null, corpTicker: corp?.ticker || "", corpName: corp?.name || "",
    allianceId: alliance?.id ?? null, allianceTicker: alliance?.ticker || "", allianceName: alliance?.name || "",
    found: true,
  };
}

// Runs `tasks` (functions → Promise) with at most `limit` in parallel,
// invoking onEach(result, completed) as they finish.
async function pool(tasks, limit, onEach) {
  let i = 0, done = 0;
  const results = new Array(tasks.length);
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try { results[idx] = await tasks[idx](); } catch { results[idx] = null; }
      done++;
      try { onEach?.(results[idx], done); } catch { /* */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// Danger from the site's 90-day scan row. The thresholds are NOT the lifetime ones
// (100/500 kills): measured on 30 real pilots, 90-day kills sit at p50 15 / p75 150
// while lifetime sits at 173 / 3 112, and 30/150 reproduced the lifetime classes on
// 20 of 30 — the rest being exactly the cases a Local wants reclassified (a 6 000-kill
// veteran idle for months is not a threat now). The row's `efficiency` is a kill/loss
// COUNT ratio, not ISK efficiency, so it is deliberately not used here.
function dangerScore90(row) {
  if (!row) return 0;
  const k = row.total_kills || 0, intel = row.intel || {};
  let s = 1;
  if (k >= 30 || intel.is_logi) s = 2;
  const fc = intel.fc?.likelihood;
  const fcHot = fc && fc !== "None" && fc !== "Low";
  if (intel.capital_pilot || fcHot || k >= 150 || (intel.bait && intel.bait !== "None")) s = 3;
  return s;
}

async function esiAffiliations(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await fetch("https://esi.evetech.net/latest/characters/affiliation/", {
      method: "POST", headers: { "content-type": "application/json", "User-Agent": UA },
      body: JSON.stringify(ids.slice(i, i + 1000)), signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`ESI affiliation ${r.status}`);
    for (const a of await r.json()) out.set(a.character_id, a);
  }
  return out;
}

// The whole Local in a handful of requests: ESI ids for every name (1), the site's
// scan for every pilot (1 per 250), ESI affiliations (1 per 1000), then one ESI call
// per DISTINCT corp/alliance (cached). Null when a step fails → per-pilot fallback.
async function localIntelBatch(target, onProgress) {
  let ids, scan, aff;
  try {
    ids = await esiIds(target);
    const chars = ids.characters;
    if (!chars.length) return null;
    [scan, aff] = await Promise.all([site.scanPilots(chars.map((c) => c.id)), esiAffiliations(chars.map((c) => c.id))]);
  } catch { return null; }
  if (!scan) return null;
  const byName = new Map(ids.characters.map((c) => [c.name.toLowerCase(), c]));
  const rows = [];
  let done = 0;
  await Promise.all(target.map(async (n) => {
    const c = byName.get(n.toLowerCase());
    if (!c) { rows.push({ name: n, id: null, danger: 0, kills: null, losses: null, eff: null, flags: [], found: false }); return; }
    const a = aff.get(c.id) || {};
    const [corp, alliance] = await Promise.all([
      groupInfo("corporations", a.corporation_id),
      a.alliance_id ? groupInfo("alliances", a.alliance_id) : null,
    ]);
    const row = scan.get(c.id) || null;   // absent = no killmail in the window, not "zero"
    const intel = row?.intel || {};
    const flags = [];
    if (intel.capital_pilot) flags.push("capital");
    if (intel.is_logi) flags.push("logi");
    if (intel.fc?.likelihood && intel.fc.likelihood !== "None") flags.push("FC:" + intel.fc.likelihood);
    if (intel.bait && intel.bait !== "None") flags.push("bait");
    if (intel.dominant_style) flags.push(intel.dominant_style);
    rows.push({
      name: c.name, id: c.id,
      danger: dangerScore90(row),
      kills: row ? row.total_kills ?? 0 : null,
      losses: row ? row.total_losses ?? 0 : null,
      eff: null,
      window: 90,
      flags,
      corpId: corp?.id ?? null, corpTicker: corp?.ticker || "", corpName: corp?.name || "",
      allianceId: alliance?.id ?? null, allianceTicker: alliance?.ticker || "", allianceName: alliance?.name || "",
      found: true,
    });
    onProgress?.(++done, target.length);
  }));
  return rows;
}

/**
 * Resolves the concise intel for a list of names (Local).
 * - cap: maximum number of pilots to resolve (the rest stay stubs)
 * - onProgress(done, total): progress callback
 * Returns { rows, total, resolved, capped, source } with rows sorted alphabetically.
 * Kills/losses are the site archive's last 90 days (`window: 90` on each row); only
 * if the site is unreachable does it fall back to per-pilot eve-kill lifetime stats.
 */
export async function localIntel(names, { cap = 100, concurrency = 4, onProgress } = {}) {
  const uniq = [...new Map((names || []).map((n) => n.trim()).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()];
  const total = uniq.length;
  const target = uniq.slice(0, cap);
  const capped = total > cap;

  let rows = await localIntelBatch(target, onProgress);
  const source = rows ? "capsuleers" : "eve-kill";
  if (!rows) {
    const tasks = target.map((n) => () => characterRow(n));
    rows = (await pool(tasks, concurrency, (_r, done) => onProgress?.(done, target.length))).filter(Boolean);
  }
  for (const n of uniq.slice(cap)) rows.push({ name: n, id: null, danger: 0, kills: null, losses: null, eff: null, flags: [], found: false });

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { rows, total, resolved: target.length, capped, source };
}

// ── Share a Local intel snapshot via capsuleers.app ─────────────────────────
// Sends the resolved character IDs to the site, which recomputes the canonical
// pilot-intel payload server-side (so the shared page shows the same colour
// tags / playstyle as a native scan — IA's local rows lack the
// /characters/analyze data) and returns a 24h share link. Called from the main
// process: the request carries no Origin header, so it passes the site's API
// origin guard. CAPSULEERS_SITE overrides the host for local dev.
const SITE_BASE = site.SITE_BASE;

export async function sharePilotIntel(characterIds) {
  const ids = [...new Set((characterIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) throw new Error("no character IDs to share");
  const r = await fetch(`${SITE_BASE}/api/pilot-intel/shares/from-scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ character_ids: ids }),
  });
  if (!r.ok) throw new Error(`share HTTP ${r.status}`);
  const d = await r.json();   // { id, url, expires_at, pilot_count }
  return { id: d.id, url: d.url, expiresAt: d.expires_at, pilotCount: d.pilot_count ?? ids.length };
}

// Share a D-Scan via capsuleers.site. Sends the raw rows; the site recomputes
// the full resolution server-side (typeID→class via ESI, including celestials
// the offline SDE can't classify) and returns a 24h link to the scan view page.
// Same anonymous, no-Origin POST as sharePilotIntel.
export async function shareDScan(rows) {
  const clean = (rows || [])
    .map((r) => ({ typeId: Number(r.typeId), name: r.name || "", group: r.group || "", distance: r.distance || "" }))
    .filter((r) => Number.isInteger(r.typeId) && r.typeId > 0);
  if (!clean.length) throw new Error("no D-Scan rows to share");
  const r = await fetch(`${SITE_BASE}/api/scans/from-dscan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ rows: clean }),
  });
  if (!r.ok) throw new Error(`share HTTP ${r.status}`);
  const d = await r.json();   // { id, url, expires_at }
  return { id: d.id, url: d.url, expiresAt: d.expires_at, objectCount: clean.length };
}

// ── D-Scan analysis (offline, via the bundled eve-fit-engine SDE) ────────────
// A directional-scan paste lists OBJECTS, not pilots: typeID + distance. We
// resolve each typeID to its ship class / category from the version-pinned SDE
// the fit engine already ships (no ESI, language-independent), then build a
// threat-sorted composition split into on-grid / off-grid.
const SHIP_CLASS_WEIGHTS = {
  Capsule: 1, Shuttle: 2, Corvette: 5, Frigate: 10, Interceptor: 15, "Assault Frigate": 18,
  "Electronic Attack Ship": 16, "Expedition Frigate": 17, "Logistics Frigate": 19,
  Destroyer: 20, "Command Destroyer": 25, "Covert Ops": 28, "Stealth Bomber": 27,
  "Recon Ship": 33, Logistics: 34, "Heavy Assault Cruiser": 36, "Heavy Interdiction Cruiser": 38,
  "Interdictor": 26, Cruiser: 30, "Strategic Cruiser": 32,
  Hauler: 35, Industrial: 45, "Mining Barge": 50, Exhumer: 55, "Transport Ship": 60,
  "Deep Space Transport": 61, "Blockade Runner": 62, Battlecruiser: 65, "Attack Battlecruiser": 70,
  "Combat Battlecruiser": 75, "Command Ship": 78, "Industrial Command Ship": 80, Battleship: 85,
  "Black Ops": 86, Marauder: 90, Freighter: 100, "Jump Freighter": 102, Carrier: 110,
  "Capital Industrial Ship": 115, Dreadnought: 120, "Lancer Dreadnought": 122, "Force Auxiliary": 130,
  Supercarrier: 140, Titan: 150,
};
const getShipRank = (cls) => SHIP_CLASS_WEIGHTS[cls] || 0;
const ROMAN_RE = /^[IVXLCDM]+$/;   // celestial position numeral (Hek VIII, Hek I …)
const CAPITAL_CLASSES = new Set(["Carrier", "Capital Industrial Ship", "Dreadnought", "Lancer Dreadnought", "Force Auxiliary", "Supercarrier", "Titan"]);

// EVE category_id → display bucket (same split as capsuleers.site's scan tool).
function dscanCategory(categoryId) {
  if (categoryId === 6) return "Ships";
  if ([3, 15, 23, 40, 46, 65].includes(categoryId)) return "Structures";
  if (categoryId === 2) return "Celestials";
  if (categoryId === 22) return "Deployables";
  if (categoryId === 18 || categoryId === 87) return "Drones";
  return "Others";
}
let _dsDataset = null;
async function fitDataset() { return (_dsDataset ||= await loadBundledDataset()); }

/**
 * Analyzes parsed D-Scan rows ({ typeId, name, group, distance }) into a flat
 * composition (no on-grid / off-grid split). Returns:
 *   total       — every detected object
 *   shipUnits   — total ship hulls
 *   shipClasses — [{ cls, count, weight, capital }] threat-sorted (for the cards)
 *   ships       — [{ typeId, name, count }] per hull, count-sorted (icon grid)
 *   other       — [{ name, count }] non-ship categories, count-sorted
 */
export async function analyzeDScan(rows) {
  const ds = await fitDataset();
  const classMap = new Map();   // ship class name -> count
  const shipMap = new Map();    // typeId -> { typeId, name, count }
  const otherMap = new Map();   // category bucket -> count
  const sysVotes = new Map();   // first-token of celestial names -> count (system inference)
  let shipUnits = 0;

  for (const r of rows) {
    const t = ds.getType(Number(r.typeId));
    const g = t && ds.groups.get(t.groupID);
    const cat = g ? dscanCategory(g.categoryID) : "Others";
    if (cat === "Ships") {
      const cls = g?.name || "Unknown";
      classMap.set(cls, (classMap.get(cls) || 0) + 1);
      const key = Number(r.typeId);
      const s = shipMap.get(key) || { typeId: key, name: t?.name || r.name || `#${key}`, count: 0 };
      s.count++; shipMap.set(key, s);
      shipUnits++;
    } else {
      otherMap.set(cat, (otherMap.get(cat) || 0) + 1);
      // System name: celestials are named "<System> <ROMAN> - …" (planets,
      // moons, belts, stations) or "<System> - Star". Vote the first token ONLY
      // when the SECOND token is a Roman numeral or a dash — that pattern is
      // unique to celestials + system-prefixed structures, so it excludes the
      // noise that otherwise dominates (mission wrecks like "Mercenary Rookie
      // Wreck", containers, POS batteries, drones). Language-independent: the
      // system name itself isn't localized, and we never match "Moon"/"Star".
      const toks = String(r.name || "").trim().split(/\s+/);
      if (toks.length >= 2 && (ROMAN_RE.test(toks[1]) || toks[1] === "-")) {
        sysVotes.set(toks[0], (sysVotes.get(toks[0]) || 0) + 1);
      }
    }
  }

  // Pick the majority token, but only trust it when several celestials agree
  // (a ships-only d-scan has no celestials → we can't know the system).
  let system = null, bestVotes = 0;
  for (const [tok, n] of sysVotes) if (n > bestVotes) { bestVotes = n; system = tok; }
  if (bestVotes < 3) system = null;

  const shipClasses = [...classMap.entries()]
    .map(([cls, count]) => ({ cls, count, weight: getShipRank(cls), capital: CAPITAL_CLASSES.has(cls) }))
    .sort((a, b) => b.weight - a.weight || b.count - a.count);
  const ships = [...shipMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const other = [...otherMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return { total: rows.length, system, shipUnits, shipClasses, ships, other };
}

/**
 * Full intel detail of a character (for the popup on row click).
 * Accepts the already-known ID (preferred) or the name. Returns an object ready
 * for rendering, or null.
 */
export async function characterDetail({ id, name } = {}) {
  if (id == null && name) { const idn = await charIdByName(name); if (idn) { id = idn.id; name = idn.name; } }
  if (id == null) return null;
  const [pd, aff] = await Promise.allSettled([pilotData(id), affiliation(id)]);
  const stats = pd.status === "fulfilled" ? pd.value.stats : null;
  const intel = pd.status === "fulfilled" ? pd.value.intel : null;
  const { corp = null, alliance = null } = aff.status === "fulfilled" ? aff.value : {};
  const ps = intel?.playstyle || {};
  return {
    id,
    name: name || `#${id}`,
    corpName: corp?.name || "", corpId: corp?.id ?? null, corpTicker: corp?.ticker || "",
    allianceName: alliance?.name || "", allianceId: alliance?.id ?? null, allianceTicker: alliance?.ticker || "",
    kills: stats?.kills ?? null,
    losses: stats?.losses ?? null,
    eff: stats?.isk_efficiency ?? null,
    danger: dangerScore(stats, intel),
    dominant: intel?.dominant_style || "",
    // Percentages for the solo / small+mid / fleet+blob bar.
    play: {
      solo: ps.solo ?? 0,
      small: (ps.small_gang ?? 0) + (ps.mid_gang ?? 0),
      fleet: (ps.fleet ?? 0) + (ps.blob ?? 0),
      avgFleet: ps.avg_fleet_size ?? null,
    },
    capital_pilot: !!intel?.capital_pilot,
    is_logi: !!intel?.is_logi,
    fc: intel?.fc?.likelihood && intel.fc.likelihood !== "None" ? intel.fc.likelihood : "",
    bait: intel?.bait && intel.bait !== "None" ? intel.bait : "",
    partners: (intel?.fleet_partners || []).slice(0, 10).map((p) => ({ id: p.id, name: p.name, count: p.count })),
    ships: (intel?.ships_flown || []).slice(0, 6).map((s) => ({ id: s.id, name: s.name, count: s.count })),
  };
}
