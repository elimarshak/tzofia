// Tzofia: "emptying skies". Runs every 10 minutes (pg_cron). For every country inside the area our aircraft
// source covers (250 nautical miles around 32.0N 34.9E), counts the aircraft that flew over it in the last
// 60 minutes, and compares that with the same 60 minutes on each of the previous 14 days. The usual level is
// the median of the days on which our source worked normally. A country is flagged when the usual level is
// at least MIN_BASE aircraft and the count now is half of it or less. The result is one JSON document.
// Country shapes: Natural Earth 1:50m (public domain), cut to the covered area by tools/build_skies_areas.py.
import postgres from "npm:postgres@3.4.5";
import areas from "./areas.json" with { type: "json" };

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

const DAYS = 14, MIN_BASE = 8, DROP = 0.5, MIN_DAYS = 3;
const AREAS = areas as Record<string, number[][][]>;

function inside(x: number, y: number, ring: number[][]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function countryOf(lon: number, lat: number) {
  for (const [code, rings] of Object.entries(AREAS)) if (rings.some((r) => inside(lon, lat, r))) return code;
  return null;
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

Deno.serve(async () => {
  try {
    const [src] = await sql`select last_ok from public.source_status where source = 'adsb.lol/point'`;
    const live = !!src?.last_ok && Date.now() - new Date(src.last_ok).getTime() < 5 * 60 * 1000;
    // airborne points (above 1,000 feet), one row per aircraft and rounded position, for each of the 15 windows
    const rows = await sql`
      select p.hex, round(p.lat::numeric, 2)::float8 as lat, round(p.lon::numeric, 2)::float8 as lon, g.d
      from generate_series(0, ${DAYS}) g(d)
      join public.aircraft_positions p
        on p.t > now() - make_interval(days => g.d) - interval '60 minutes' and p.t <= now() - make_interval(days => g.d)
      where coalesce(p.alt_baro, p.alt_geom, 0) > 1000
      group by 1, 2, 3, 4`;
    // distinct aircraft per day window, per country and for the whole covered area
    const seen = new Map<string, Set<string>>();
    const add = (k: string, hex: string) => { let s = seen.get(k); if (!s) seen.set(k, s = new Set()); s.add(hex); };
    const cache = new Map<string, string | null>();
    for (const r of rows) {
      add(`${r.d}|ALL`, r.hex);
      const key = `${r.lon},${r.lat}`;
      let c = cache.get(key);
      if (c === undefined) { c = countryOf(r.lon, r.lat); cache.set(key, c); }
      if (c) add(`${r.d}|${c}`, r.hex);
    }
    const n = (d: number, k: string) => seen.get(`${d}|${k}`)?.size ?? 0;
    // a past day counts only if our source worked normally then: its whole-area count is at least 60% of the median
    const past = Array.from({ length: DAYS }, (_, i) => i + 1).filter((d) => n(d, "ALL") > 0);
    const allMed = past.length ? median(past.map((d) => n(d, "ALL"))) : 0;
    const good = past.filter((d) => n(d, "ALL") >= 0.6 * allMed);
    const enough = good.length >= MIN_DAYS;
    const area = (k: string) => {
      const now = n(0, k), base = enough ? median(good.map((d) => n(d, k))) : null;
      return { code: k, now, base, drop: live && enough && base != null && base >= MIN_BASE && now <= DROP * base };
    };
    const data = {
      window_min: 60, days: good.length, need_days: MIN_DAYS, live, min_base: MIN_BASE,
      all: area("ALL"),
      areas: Object.keys(AREAS).map(area).sort((a, b) => (b.base ?? b.now) - (a.base ?? a.now)),
    };
    await sql`insert into public.derived (key, data, computed_at) values ('skies', ${sql.json(data as never)}, now())
              on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at`;
    return reply({ rows: rows.length, days: good.length, flagged: data.areas.filter((a) => a.drop).map((a) => a.code) });
  } catch (e) {
    return reply({ error: String(e).slice(0, 200) }, 500);
  }
});
