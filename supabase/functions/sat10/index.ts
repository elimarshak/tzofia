// Tzofia: sharp satellite picture (Sentinel-2, 10 metres per pixel) served as map tiles.
// URL: /functions/v1/sat10/{z}/{x}/{y}
// A tile is taken from our own store when we have a copy younger than KEEP_DAYS; otherwise it is requested from
// the Copernicus Data Space (Sentinel Hub Process API), stored, and returned. The free Copernicus account allows
// 10,000 requests a month, so new requests are capped per day; past the cap we return the old copy or an empty tile.
// Secrets (function secrets only, never in the repository or the browser): CDSE_CLIENT_ID, CDSE_CLIENT_SECRET.
import postgres from "npm:postgres@3.4.5";

const AREA = { west: 24, south: 12, east: 64, north: 43 };   // Egypt to Iran, Yemen to Turkey
const Z_MIN = 9, Z_MAX = 13;
const KEEP_DAYS = 5, DAY_CAP = 300, WINDOW_DAYS = 10, MAX_CLOUD = 30;
const BUCKET = "sat10";
const BASE = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
// the project's server key: a classic key is a signed token and goes in Authorization too; a new-style key goes in apikey only
const AUTH: Record<string, string> = SERVICE.startsWith("eyJ") ? { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } : { apikey: SERVICE };
const CORS = { "Access-Control-Allow-Origin": "*" };
// 1x1 transparent PNG
const EMPTY = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const empty = (why: string) => new Response(EMPTY, { headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "public, max-age=600", "X-Tile": why } });
const picture = (body: BodyInit, why: string) => new Response(body, { headers: { ...CORS, "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=43200", "X-Tile": why } });

const R = 20037508.342789244;
const tileBox = (z: number, x: number, y: number) => {
  const span = (2 * R) / 2 ** z;
  return [-R + x * span, R - (y + 1) * span, -R + (x + 1) * span, R - y * span];
};
const lon = (mx: number) => (mx / R) * 180;
const lat = (my: number) => (Math.atan(Math.sinh((my / R) * Math.PI)) * 180) / Math.PI;

let token: { value: string; until: number } | null = null;
async function getToken() {
  if (token && Date.now() < token.until) return token.value;
  const id = Deno.env.get("CDSE_CLIENT_ID"), secret = Deno.env.get("CDSE_CLIENT_SECRET");
  if (!id || !secret) throw new Error("CDSE secrets are not set");
  const r = await fetch("https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id.trim(), client_secret: secret.trim() }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`token HTTP ${r.status} ${String(j.error ?? "")}`);
  token = { value: j.access_token, until: Date.now() + (Number(j.expires_in ?? 300) - 60) * 1000 };
  return token.value;
}

const EVALSCRIPT = `//VERSION=3
function setup() { return { input: ["B04", "B03", "B02"], output: { bands: 3 } }; }
function evaluatePixel(s) { return [2.5 * s.B04, 2.5 * s.B03, 2.5 * s.B02]; }`;

async function setStatus(ok: boolean, error: string | null) {
  await sql`insert into public.source_status (source, last_ok, last_count, last_error, last_try)
            values ('copernicus-s2', ${ok ? sql`now()` : null}, null, ${error}, now())
            on conflict (source) do update set
              last_ok = coalesce(excluded.last_ok, public.source_status.last_ok),
              last_error = excluded.last_error, last_try = excluded.last_try`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const m = new URL(req.url).pathname.match(/\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})$/);
    if (!m) return new Response("bad tile", { status: 400, headers: CORS });
    const z = +m[1], x = +m[2], y = +m[3];
    if (z < Z_MIN || z > Z_MAX || x >= 2 ** z || y >= 2 ** z) return empty("zoom");
    const box = tileBox(z, x, y);
    if (lon(box[2]) < AREA.west || lon(box[0]) > AREA.east || lat(box[3]) < AREA.south || lat(box[1]) > AREA.north) return empty("area");

    const name = `${z}/${x}/${y}.jpg`;
    const stored = () => fetch(`${BASE}/storage/v1/object/public/${BUCKET}/${name}`);
    const [have] = await sql`select updated_at from storage.objects where bucket_id = ${BUCKET} and name = ${name}`;
    const fresh = have && Date.now() - new Date(have.updated_at).getTime() < KEEP_DAYS * 86400e3;
    if (fresh) { const r = await stored(); if (r.ok) return picture(r.body!, "stored"); }

    // count this new request against today's allowance, atomically
    const today = new Date().toISOString().slice(0, 10);
    const [b] = await sql`insert into public.derived (key, data, computed_at) values ('sat10_budget', ${sql.json({ day: today, n: 1 })}, now())
      on conflict (key) do update set computed_at = now(), data = case when public.derived.data->>'day' = ${today}
        then jsonb_build_object('day', ${today}::text, 'n', (public.derived.data->>'n')::int + 1)
        else jsonb_build_object('day', ${today}::text, 'n', 1) end
      returning (data->>'n')::int as n`;
    if (b.n > DAY_CAP) {
      if (have) { const r = await stored(); if (r.ok) return picture(r.body!, "stored-old"); }
      return empty("cap");
    }

    const to = new Date(), from = new Date(to.getTime() - WINDOW_DAYS * 86400e3);
    const r = await fetch("https://sh.dataspace.copernicus.eu/api/v1/process", {
      method: "POST",
      headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json", Accept: "image/jpeg" },
      body: JSON.stringify({
        input: {
          bounds: { bbox: box, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/3857" } },
          data: [{ type: "sentinel-2-l2a", dataFilter: { timeRange: { from: from.toISOString(), to: to.toISOString() }, maxCloudCoverage: MAX_CLOUD, mosaickingOrder: "mostRecent" } }],
        },
        output: { width: 512, height: 512, responses: [{ identifier: "default", format: { type: "image/jpeg", quality: 85 } }] },
        evalscript: EVALSCRIPT,
      }),
    });
    if (!r.ok) {
      const text = (await r.text()).slice(0, 200);
      await setStatus(false, `HTTP ${r.status}: ${text}`);
      if (have) { const s = await stored(); if (s.ok) return picture(s.body!, "stored-old"); }
      return empty("source-" + r.status);
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    const up = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${name}`, {
      method: "POST", headers: { ...AUTH, "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "max-age=43200" }, body: bytes,
    });
    await setStatus(true, up.ok ? null : `store HTTP ${up.status} (key kind ${SERVICE.slice(0, 3)}, env ${Object.keys(Deno.env.toObject()).filter((k) => k.startsWith("SUPABASE_")).join(" ")}): ${(await up.text()).slice(0, 120)}`);
    return picture(bytes, "new");
  } catch (e) {
    return new Response(String(e).slice(0, 200), { status: 500, headers: CORS });
  }
});
