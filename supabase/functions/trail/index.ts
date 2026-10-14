// Tzofia: the path one aircraft flew in the last hour, for the line drawn on the map when it is selected.
//   GET ?hex=4x1234  -> { hex, points: [[lon, lat], ...] }, oldest first
// Reads our own stored history (public.aircraft_positions, about one point a minute per aircraft).
// That table is not readable from browsers, so this function hands out only this one small, public slice.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const ORIGINS = ["https://openeye.co.il", "https://www.openeye.co.il", "https://elimarshak.github.io"];

// The source sometimes sends impossible positions (a jump of hundreds of km in a minute, or one stray point).
// Leading trackers do not draw those, so neither do we: drop lone spikes, then keep only the newest stretch
// that a real aircraft could have flown, cut at the first impossible jump or a gap of over 15 minutes.
type P = { lon: number; lat: number; s: number };
const km = (a: P, b: P) => {
  const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(x)));
};
const MAX_KMH = 1300, MAX_GAP_S = 900;
function clean(p: P[]): P[] {
  const q = p.filter((x, i) => {   // a point far from both neighbours while they sit close together is a spike
    if (i === 0 || i === p.length - 1) return true;
    const a = km(p[i - 1], x), b = km(x, p[i + 1]);
    return !(Math.min(a, b) > 10 && km(p[i - 1], p[i + 1]) < 0.3 * Math.min(a, b));
  });
  const out: P[] = q.length ? [q[q.length - 1]] : [];
  for (let i = q.length - 2; i >= 0; i--) {
    const a = q[i], b = out[out.length - 1], dt = b.s - a.s, d = km(a, b);
    if (dt > MAX_GAP_S || (dt <= 0 ? d > 1 : d / (dt / 3600) > MAX_KMH)) break;
    out.push(a);
  }
  return out.reverse();
}

Deno.serve(async (req) => {
  const o = req.headers.get("origin") ?? "";
  const h = { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin", "Cache-Control": "public, max-age=30" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const hex = (new URL(req.url).searchParams.get("hex") ?? "").toLowerCase();
  if (!/^~?[0-9a-f]{6}$/.test(hex)) return new Response(JSON.stringify({ error: "bad hex" }), { status: 400, headers: h });
  try {
    const rows = await sql`select lon, lat, extract(epoch from t) as s from public.aircraft_positions
                           where hex = ${hex} and t > now() - interval '60 minutes' order by t limit 1500`;
    const pts = clean(rows.map((r) => ({ lon: +r.lon, lat: +r.lat, s: +r.s })));
    return new Response(JSON.stringify({ hex, points: pts.map((r) => [Math.round(r.lon * 1e4) / 1e4, Math.round(r.lat * 1e4) / 1e4]) }), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 120) }), { status: 500, headers: h });
  }
});
