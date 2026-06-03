// Character-intel enrichment built on the EVE-KILL MCP server (see mcp.mjs).
//
// This is the Intel-only slice of the original Capsuleers.IA mcp-intel module: it keeps
// ONLY the two helpers that intel.mjs calls to enrich a clipboard Local-roster pilot
// (`dossierExtra` for the per-pilot tag/playstyle/wingmate text, `characterCard` for the
// structured drawer card). The large natural-language MCP analytics dispatcher (`maybeMcp`,
// doctrine specs, battles, flies-with, …) lived behind the AI chat and is intentionally
// dropped here — so this module has no dependency on fit.mjs / eve-fit-engine for stats or
// on eveworkbench.mjs. Both helpers are tolerant to the exact JSON shape and never throw.
import { callTool } from "./mcp.mjs";

/**
 * Concise extra intel for a CHARACTER from capsuleer_dossier: archetype tags
 * (FC/CAPITAL/SUPER/BLOPS/LOGI/CYNO/GANKER/NEWBIE), playstyle and top wingmates —
 * data the plain killboard stats don't surface. Returns an Italian text block, or "".
 * Tolerant to the exact JSON shape; never throws.
 */
export async function dossierExtra(entity, type = "character") {
  try {
    const d = await callTool("capsuleer_dossier", { entity, type, format: "json" });
    if (!d || typeof d !== "object") return "";
    const tags = d.archetype_tags || d.archetypes || d.tags || d.archetype || null;
    const wing = d.top_wingmates || d.wingmates || d.flies_with || d.fleet_partners || null;
    const style = d.playstyle_90d || d.playstyle || d.dominant_style || d.play_style || null;
    const lines = [];
    if (tags) {
      const list = Array.isArray(tags) ? tags : Object.keys(tags);
      if (list.length) lines.push(`Archetipi (eve-kill): ${list.slice(0, 8).join(", ")}.`);
    }
    if (style) {
      const solo = style.solo_pct ?? style.solo;
      const s = typeof style === "string" ? style
        : [style.dominant && `stile dominante: ${style.dominant}`,
           solo != null && `solo ${solo}%`,
           style.avg_fleet_size && `flotta media ${style.avg_fleet_size}`].filter(Boolean).join(", ");
      if (s) lines.push(`Playstyle: ${s}.`);
    }
    if (Array.isArray(wing) && wing.length) {
      const names = wing.map((w) => w.name || w.character_name || w.character?.name).filter(Boolean).slice(0, 5);
      if (names.length) lines.push(`Vola spesso con: ${names.join(", ")}.`);
    }
    return lines.length ? `Dossier eve-kill (MCP):\n${lines.join("\n")}` : "";
  } catch { return ""; }
}

/**
 * Structured CHARACTER profile card from capsuleer_dossier (portrait + lifetime stats +
 * playstyle bars + recent-ship icons + wingmate chips), optionally enriched with FC
 * likelihood / archetype flags from the killboard /intel endpoint. Returns
 * { card, summary } for intel.mjs to render + give the model a one-line context, or null.
 */
export async function characterCard(id, name, extra = {}) {
  let d;
  try { d = await callTool("capsuleer_dossier", { entity: String(id), type: "character", format: "json" }); }
  catch { return null; }
  if (!d || typeof d !== "object") return null;
  const lf = d.lifetime || {};
  const ps = d.playstyle_90d || d.playstyle || {};
  const st = extra.stats || {};
  const ships = (d.top_ships || []).slice(0, 6)
    .map((s) => ({ id: s.type_id ?? s.id, name: s.name, n: s.kills ?? s.count ?? 0 })).filter((s) => s.id);
  const wingmates = (d.top_wingmates || []).slice(0, 6)
    .map((w) => ({ id: w.character_id ?? w.character?.id, name: w.name || w.character_name, shared: w.shared_kills ?? w.count ?? null }))
    .filter((w) => w.id && w.name);
  const tags = Array.isArray(d.archetype_tags) ? d.archetype_tags : (Array.isArray(d.tags) ? d.tags : []);
  const kills = lf.kills ?? st.kills ?? null;
  const losses = lf.losses ?? st.losses ?? null;
  const iskEff = lf.isk_efficiency ?? lf.efficiency ?? st.isk_efficiency ?? null;
  const card = {
    kind: "pilot",
    entity: { id: Number(id), type: "character", name: name || d.entity?.name || "?", href: d.entity?.url || `https://eve-kill.com/character/${id}` },
    stats: { kills, losses, iskEff },
    playstyle: ps.dominant ? {
      dominant: ps.dominant,
      bars: [["solo", ps.solo_pct], ["small", ps.small_gang_pct], ["mid", ps.mid_gang_pct], ["fleet", ps.fleet_pct], ["blob", ps.blob_pct]]
        .map(([k, v]) => [k, Number(v) || 0]),
      avgFleet: ps.avg_fleet_size ?? null,
    } : null,
    tags, fc: extra.fc || null, flags: extra.flags || [], ships, wingmates,
  };
  const summary = `${card.entity.name}: ${kills ?? "?"} kill / ${losses ?? "?"} perdite`
    + (iskEff != null ? `, ISK eff ${iskEff}%` : "")
    + (ps.dominant ? `, stile ${ps.dominant}` : "")
    + (wingmates.length ? `, vola con ${wingmates.slice(0, 3).map((w) => w.name).join(", ")}` : "") + ".";
  return { card, summary };
}
