// Tzofia: recent earthquakes in the map area, from EMSC's public event service (licence CC BY 4.0).
// Runs every 5 minutes (pg_cron) and overwrites one small JSON document that browsers read.
import postgres from "npm:postgres@3.4.5";

const BBOX = { w: 26, s: 25, e: 42, n: 38 }; // same box as the basemap
const HOURS = 48;
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function setStatus(ok: boolean, count: number | null, error: string | null) {
  await sql`insert into public.source_status (source, last_ok, last_count, last_error, last_try)
            values ('emsc', ${ok ? sql`now()` : null}, ${count}, ${error}, now())
            on conflict (source) do update set
              last_ok = coalesce(excluded.last_ok, public.source_status.last_ok),
              last_count = coalesce(excluded.last_count, public.source_status.last_count),
              last_error = excluded.last_error, last_try = excluded.last_try`;
}

Deno.serve(async () => {
  try {
    const [last] = await sql`select computed_at from public.derived where key = 'quakes'`;
    if (last && Date.now() - new Date(last.computed_at).getTime() < 4 * 60 * 1000) return reply({ skipped: "fresh" });
    const start = new Date(Date.now() - HOURS * 3600 * 1000).toISOString().slice(0, 19);
    const url = "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=300&orderby=time" +
      `&start=${start}&minlat=${BBOX.s}&maxlat=${BBOX.n}&minlon=${BBOX.w}&maxlon=${BBOX.e}`;
    const r = await fetch(url, { headers: { "User-Agent": "tzofia/0.1 (+https://github.com/elimarshak/tzofia)" } });
    if (r.status === 204) {            // the service answers 204 when there are no events
      const data = { hours: HOURS, events: [] };
      await sql`insert into public.derived (key, data, computed_at) values ('quakes', ${sql.json(data as never)}, now())
                on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at`;
      await setStatus(true, 0, null);
      return reply({ events: 0 });
    }
    const text = await r.text();
    if (r.status !== 200) { await setStatus(false, null, `HTTP ${r.status}: ${text.slice(0, 120)}`); return reply({ error: r.status }, 502); }
    const j = JSON.parse(text);
    const events = (j.features ?? []).map((f: any) => {
      const p = f.properties ?? {};
      return {
        id: String(p.unid ?? f.id ?? ""), time: p.time, lat: Number(p.lat), lon: Number(p.lon),
        mag: p.mag == null ? null : Number(p.mag), magtype: p.magtype ?? null,
        depth: p.depth == null ? null : Math.abs(Number(p.depth)), region: p.flynn_region ?? null, type: p.evtype ?? null,
      };
    }).filter((e: any) => e.id && e.time && Number.isFinite(e.lat) && Number.isFinite(e.lon));
    const data = { hours: HOURS, events };
    await sql`insert into public.derived (key, data, computed_at) values ('quakes', ${sql.json(data as never)}, now())
              on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at`;
    await setStatus(true, events.length, null);
    return reply({ events: events.length, sampleKeys: Object.keys(j.features?.[0]?.properties ?? {}), sample: events[0] ?? null });
  } catch (e) {
    return reply({ error: String(e).slice(0, 300) }, 500);
  }
});
