// Tzofia: the path one aircraft flew in the last hour, for the line drawn on the map when it is selected.
//   GET ?hex=4x1234  -> { hex, points: [[lon, lat], ...] }, oldest first
// Reads our own stored history (public.aircraft_positions, about one point a minute per aircraft).
// That table is not readable from browsers, so this function hands out only this one small, public slice.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const ORIGINS = ["https://openeye.co.il", "https://www.openeye.co.il", "https://elimarshak.github.io"];

Deno.serve(async (req) => {
  const o = req.headers.get("origin") ?? "";
  const h = { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin", "Cache-Control": "public, max-age=30" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const hex = (new URL(req.url).searchParams.get("hex") ?? "").toLowerCase();
  if (!/^~?[0-9a-f]{6}$/.test(hex)) return new Response(JSON.stringify({ error: "bad hex" }), { status: 400, headers: h });
  try {
    const rows = await sql`select lon, lat from public.aircraft_positions
                           where hex = ${hex} and t > now() - interval '60 minutes' order by t limit 1500`;
    return new Response(JSON.stringify({ hex, points: rows.map((r) => [Math.round(r.lon * 1e4) / 1e4, Math.round(r.lat * 1e4) / 1e4]) }), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e).slice(0, 120) }), { status: 500, headers: h });
  }
});
