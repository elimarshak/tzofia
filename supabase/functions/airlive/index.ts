// Tzofia: live air-quality readings in Israel, from two sources, passed on as they are now (nothing is stored).
//   GET            -> { at, sc: [...], waqi: [...] | null }
//                     sc:   Sensor.Community, home particle sensors run by volunteers (open data, ODbL):
//                           [{ id, lat, lon, pm25, pm10, t }]  micrograms per cubic metre, the last 5-minute average
//                     waqi: the World Air Quality Index project, which republishes the Ministry of Environmental
//                           Protection's stations: [{ uid, lat, lon, aqi, name, t }]  aqi on the US EPA scale.
//                           null while the WAQI_TOKEN secret is not set.
//   GET ?uid=123   -> one WAQI station: { aqi, pol, iaqi: { pm25: 41, no2: 12, ... }, t, name, attributions }
// WAQI's terms: credit WAQI and the original agency, no archive of their data. Each answer is kept in memory for up
// to 4 minutes, so many visitors at once cost the sources one request.
const ORIGINS = ["https://openeye.co.il", "https://www.openeye.co.il", "https://elimarshak.github.io"];
const UA = { "User-Agent": "tzofia/0.1 (+https://github.com/elimarshak/tzofia)" };
const BOX = { s: 29.3, w: 34.2, n: 33.5, e: 35.95 };   // Israel and the strip around it
const KEEP_MS = 4 * 60 * 1000;
const memo = new Map<string, { at: number; body: unknown }>();

async function cached<T>(key: string, f: () => Promise<T>): Promise<T> {
  const m = memo.get(key);
  if (m && Date.now() - m.at < KEEP_MS) return m.body as T;
  const body = await f();
  memo.set(key, { at: Date.now(), body });
  return body;
}
let scStats: unknown = null;
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

async function sensorCommunity() {
  // by country and by the box around Israel: some sensors carry no country, or a neighbouring one
  const get = async (f: string) => { const r = await fetch("https://data.sensor.community/airrohr/v1/filter/" + f, { headers: UA }); if (!r.ok) throw new Error("sensor.community " + r.status); return await r.json() as any[]; };
  const [a, b] = await Promise.all([get("country=IL"), get(`box=${BOX.s},${BOX.w},${BOX.n},${BOX.e}`).catch(() => [])]);
  const rows = a.concat(b);
  scStats = { country: a.length, box: b.length, indoor: rows.filter((x) => +x?.location?.indoor === 1).length };
  const out = new Map<string, { id: string; lat: number; lon: number; pm25: number | null; pm10: number | null; t: string }>();
  for (const x of rows) {
    if (x?.location?.indoor === 1 || x?.location?.indoor === "1") continue;   // a sensor inside a home says nothing about the street
    const vals: Record<string, number | null> = {};
    for (const v of x.sensordatavalues ?? []) vals[v.value_type] = num(v.value);
    const pm25 = vals.P2 ?? null, pm10 = vals.P1 ?? null;
    if (pm25 == null || pm25 < 0 || pm25 > 1000) continue;   // only particle sensors, and not an obviously broken reading
    const lat = num(x.location?.latitude), lon = num(x.location?.longitude);
    if (lat == null || lon == null) continue;
    const id = String(x.sensor?.id ?? x.location?.id);
    const t = String(x.timestamp ?? "").replace(" ", "T") + "Z";   // the service gives UTC without a zone
    const old = out.get(id);
    if (!old || t > old.t) out.set(id, { id, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, pm25, pm10: pm10 != null && pm10 >= 0 && pm10 < 2000 ? pm10 : null, t });
  }
  return [...out.values()];
}

async function waqiMap(token: string) {
  const u = `https://api.waqi.info/v2/map/bounds?latlng=${BOX.s},${BOX.w},${BOX.n},${BOX.e}&networks=all&token=${encodeURIComponent(token)}`;
  const j = await (await fetch(u, { headers: UA })).json();
  if (j?.status !== "ok") throw new Error("waqi " + String(j?.data ?? j?.status).slice(0, 80));
  return (j.data as any[]).map((x) => ({ uid: x.uid, lat: x.lat, lon: x.lon, aqi: num(x.aqi), name: x.station?.name ?? "", t: x.station?.time ?? null }));
}

async function waqiStation(token: string, uid: number) {
  const j = await (await fetch(`https://api.waqi.info/feed/@${uid}/?token=${encodeURIComponent(token)}`, { headers: UA })).json();
  if (j?.status !== "ok") throw new Error("waqi " + String(j?.data ?? j?.status).slice(0, 80));
  const d = j.data;
  const iaqi: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.iaqi ?? {})) { const x = num((v as any)?.v); if (x != null) iaqi[k] = x; }
  return { aqi: num(d.aqi), pol: d.dominentpol ?? null, iaqi, t: d.time?.iso ?? null, name: d.city?.name ?? "",
    attributions: (d.attributions ?? []).map((a: any) => ({ name: String(a.name ?? ""), url: String(a.url ?? "") })) };
}

Deno.serve(async (req) => {
  const o = req.headers.get("origin") ?? "";
  const h = { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], Vary: "Origin", "Cache-Control": "public, max-age=120" };
  const reply = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: h });
  const token = Deno.env.get("WAQI_TOKEN") ?? "";
  const q = new URL(req.url).searchParams;
  try {
    if (q.has("uid")) {
      const uid = Number(q.get("uid"));
      if (!token || !Number.isInteger(uid) || uid <= 0) return reply({ error: "bad request" }, 400);
      return reply(await cached("st" + uid, () => waqiStation(token, uid)));
    }
    const [sc, waqi] = await Promise.all([
      cached("sc", sensorCommunity).catch((e) => { console.log(String(e)); return null; }),
      token ? cached("waqi", () => waqiMap(token)).catch((e) => { console.log(String(e)); return null; }) : Promise.resolve(null),
    ]);
    return reply({ at: new Date().toISOString(), sc, waqi, waqiOn: !!token, ...(q.has("stats") ? { scStats } : {}) });
  } catch (e) {
    return reply({ error: String(e).slice(0, 200) }, 500);
  }
});
