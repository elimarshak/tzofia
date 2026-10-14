// Tzofia: our own visit counter (see db/migrations/0012_visits.sql). No outside service, no cookie, no address stored.
//   POST { kind: 'open' | 'ping' | 'event', vid, sid, name?, path?, ref?, src?, w, lang, theme, tz, me }  -> 204
// Country and city: looked up in our own address table (ipgeo.json on the data branch, built monthly from DB-IP's
// free table), loaded once per function start. The address is used for that lookup only and is not kept.
// Automatic visitors (search engines, link previews, test browsers) are not counted.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const ORIGINS = ["https://openeye.co.il", "https://www.openeye.co.il"];
const GEO_URL = "https://raw.githubusercontent.com/elimarshak/tzofia/data/ipgeo.json";
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|meta-external|whatsapp|telegram|slack|discord|skype|headless|lighthouse|pagespeed|curl|python|wget|go-http|node-fetch|axios|java\//i;
const ID = /^[a-z0-9]{12,40}$/;
const NAME = /^[a-z0-9:_.-]{1,48}$/;
const cut = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);

// ---- our address table ----
type Geo = { labels: string[]; v4: number[]; v4l: number[]; v6: string[]; v6l: number[] };
let geo: Geo | null = null;
let geoLoading: Promise<void> | null = null;
function loadGeo() {
  geoLoading ??= (async () => {
    try {
      const j = await (await fetch(GEO_URL)).json();
      const v4: number[] = []; let acc = 0;
      for (const d of j.v4.d) { acc += d; v4.push(acc); }
      geo = { labels: j.labels, v4, v4l: j.v4.l, v6: j.v6.s, v6l: j.v6.l };
    } catch (e) { console.log("address table not loaded", String(e).slice(0, 120)); geoLoading = null; }
  })();
  return geoLoading;
}
function last<T>(arr: T[], x: T) {   // index of the last start that is not after x
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}
function v6top(ip: string) {   // the first 64 bits of an IPv6 address, as 16 hex digits
  let [a, b] = ip.split("::");
  const head = a ? a.split(":") : [], tail = b !== undefined && b ? b.split(":") : [];
  const groups = b !== undefined ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail] : head;
  return groups.slice(0, 4).map((g) => g.padStart(4, "0")).join("").toLowerCase();
}
function place(ip: string): [string | null, string | null] {
  if (!geo || !ip) return [null, null];
  let i = -1, li = -1;
  if (ip.includes(":")) { i = last(geo.v6, v6top(ip)); li = i >= 0 ? geo.v6l[i] : -1; }
  else { const p = ip.split(".").map(Number); if (p.length === 4) { i = last(geo.v4, ((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]); li = i >= 0 ? geo.v4l[i] : -1; } }
  if (li < 0) return [null, null];
  const [c, city] = geo.labels[li].split("|");
  return [c && c !== "ZZ" ? c : null, city || null];
}

function osOf(ua: string) {
  return /Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Windows/i.test(ua) ? "windows"
    : /Macintosh|Mac OS X/i.test(ua) ? "mac" : /CrOS/i.test(ua) ? "chromeos" : /Linux/i.test(ua) ? "linux" : "other";
}

Deno.serve(async (req) => {
  const o = req.headers.get("origin") ?? "";
  const h = { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type", Vary: "Origin" };
  const done = () => new Response(null, { status: 204, headers: h });
  if (req.method === "OPTIONS") return done();
  if (req.method !== "POST" || !ORIGINS.includes(o)) return done();
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOTS.test(ua)) return done();
  try {
    const b = await req.json();
    const kind = ["open", "ping", "event"].includes(b.kind) ? b.kind : null;
    const vid = String(b.vid ?? ""), sid = String(b.sid ?? "");
    if (!kind || !ID.test(vid) || !ID.test(sid)) return done();
    const name = kind === "event" ? (NAME.test(String(b.name ?? "")) ? String(b.name) : null) : null;
    if (kind === "event" && !name) return done();
    let ref: string | null = null;
    if (kind === "open") try { const host = new URL(String(b.ref ?? "")).hostname.replace(/^www\./, ""); if (host && !host.endsWith("openeye.co.il")) ref = host.slice(0, 100); } catch { /* none */ }
    const src = kind === "open" && /^[a-z0-9_-]{1,40}$/i.test(String(b.src ?? "")) ? String(b.src).toLowerCase() : null;
    const w = Number.isInteger(b.w) && b.w > 0 && b.w < 10000 ? b.w : null;
    await loadGeo();
    const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
    const [country, city] = place(ip);
    await sql`insert into ingest.visits (vid, sid, kind, name, path, ref, src, dev, os, w, lang, theme, country, city, tz, me)
      values (${vid}, ${sid}, ${kind}, ${name}, ${kind === "open" ? cut(b.path, 120) : null}, ${ref}, ${src},
              ${/Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "mobile" : "desktop"}, ${osOf(ua)}, ${w},
              ${b.lang === "en" ? "en" : "he"}, ${b.theme === "dark" ? "dark" : "light"}, ${country}, ${city}, ${cut(b.tz, 40)}, ${b.me === true})`;
  } catch (e) {
    console.log("hit failed", String(e).slice(0, 200));
  }
  return done();
});
