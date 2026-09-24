// Live check of the Local intel backend (capsuleers.app API v1 first, eve-kill fallback).
// Network required. Run twice: normally, and with the site unreachable:
//   node tools/verify-intel-backend.mjs
//   CAPSULEERS_SITE=http://127.0.0.1:9 node tools/verify-intel-backend.mjs --fallback
const FALLBACK = process.argv.includes("--fallback");
const { localIntel, characterDetail } = await import("../src/intel.mjs");
const { apiFamily } = await import("../src/capsuleers-api.mjs");

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) fail++; };
const UA = { "User-Agent": "Capsuleers.Intel verify (+https://capsuleers.app)" };

// A real Local: victims of the latest killmails on the site's archive, names via ESI.
const rows = (await (await fetch("https://capsuleers.app/api/v1/killmails/search", {
  method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ limit: 80 }),
})).json()).rows;
const ids = [...new Set(rows.map((r) => r.victim?.character_id).filter(Boolean))].slice(0, 60);
const names = (await (await fetch("https://esi.evetech.net/latest/universe/names/", {
  method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify(ids),
})).json()).map((x) => x.name);
names.push("Nessuno Con Questo Nome Xq", names[0].toUpperCase());   // unknown + a case duplicate

const t0 = Date.now();
const res = await localIntel(names, { cap: 100 });
const found = res.rows.filter((r) => r.found);
ok(res.source === (FALLBACK ? "eve-kill" : "capsuleers"), `Local: sorgente ${res.source} (${Date.now() - t0} ms, ${names.length} nomi)`);
ok(res.total === names.length - 1, `Local: il duplicato per maiuscole conta una volta (${res.total})`);
ok(found.length >= names.length - 3, `Local: ${found.length} piloti risolti`);
ok(res.rows.some((r) => r.name === "Nessuno Con Questo Nome Xq" && !r.found), "Local: il nome inesistente resta non trovato");
ok(found.some((r) => r.corpTicker), "Local: ticker di corporazione presenti");
if (!FALLBACK) ok(found.every((r) => r.window === 90 && r.eff == null), "Local: numeri a 90 giorni, nessuna efficienza ISK spacciata");

const d = await characterDetail({ name: "TremalJack" });
ok(d && d.kills > 1000 && d.play && d.partners.length && d.ships.length, "dettaglio pilota: totali, stile, compagni, navi");
const d2 = await characterDetail({ id: 789877270 });
ok(d2 && d2.name && d2.corpTicker, "dettaglio pilota per id: nome e ticker");

console.log(`famiglia API del sito: ${apiFamily()}`);
process.exit(fail ? 1 : 0);
