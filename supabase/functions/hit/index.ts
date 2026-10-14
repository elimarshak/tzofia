// Tzofia: our own count of visits (see db/migrations/0012_visits.sql). No outside service, no cookie, no IP stored.
//   POST { kind: 'open' | 'ping', vid, path, ref, lang, tz }  -> 204
// The country and city come from the network's own headers; the device type from the browser's description.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const ORIGINS = ["https://openeye.co.il", "https://www.openeye.co.il", "https://elimarshak.github.io"];
const BOTS = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|headless|lighthouse|curl|python|wget/i;
const cut = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);

Deno.serve(async (req) => {
  const o = req.headers.get("origin") ?? "";
  const h = { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type", Vary: "Origin" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST" || !ORIGINS.includes(o)) return new Response(null, { status: 204, headers: h });
  const ua = req.headers.get("user-agent") ?? "";
  if (BOTS.test(ua)) return new Response(null, { status: 204, headers: h });
  try {
    const b = await req.json();
    const kind = b.kind === "ping" ? "ping" : "open";
    const vid = cut(b.vid, 40);
    if (!vid || !/^[a-z0-9]+$/i.test(vid)) return new Response(null, { status: 204, headers: h });
    let ref: string | null = null;
    try { const host = new URL(String(b.ref ?? "")).hostname; if (host && !host.endsWith("openeye.co.il")) ref = host.slice(0, 100); } catch { /* none */ }
    const dev = /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";
    const country = cut(req.headers.get("cf-ipcountry"), 2);
    const cityRaw = req.headers.get("cf-ipcity");
    await sql`insert into ingest.visits (kind, vid, path, ref, dev, lang, country, city, tz)
              values (${kind}, ${vid}, ${cut(b.path, 120)}, ${ref}, ${dev}, ${b.lang === "en" ? "en" : "he"}, ${country}, ${cut(cityRaw, 60)}, ${cut(b.tz, 40)})`;
  } catch (e) {
    console.log("hit failed", String(e).slice(0, 200));
  }
  return new Response(null, { status: 204, headers: h });
});
