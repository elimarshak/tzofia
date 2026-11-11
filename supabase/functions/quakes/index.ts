// Tzofia: recent earthquakes in the map area, from four public earthquake services, merged into one list:
//   EMSC  (European-Mediterranean Seismological Centre, licence CC BY 4.0)
//   USGS  (United States Geological Survey, public domain)
//   GFZ   (GEOFON, German Research Centre for Geosciences, CC BY 4.0)
//   NOA   (National Observatory of Athens, Institute of Geodynamics)
// The Geological Survey of Israel answers only to computers in Israel, so the home server sends its list
// separately (public.il_ingest, key 'quakes_gsi'); the site merges that list with this one.
// One earthquake reported by several services appears once, with the list of services that reported it:
// two reports are the same earthquake when they are less than 90 seconds and 150 km apart.
// Runs every 5 minutes (pg_cron) and overwrites one small JSON document that browsers read.
import postgres from "npm:postgres@3.4.5";

const BBOX = { w: -18, s: 12, e: 64, n: 43 }; // same box as the basemap
const HOURS = 48;
const MIN_MAG = 2.5;
const UA = { "User-Agent": "tzofia/0.2 (+https://github.com/elimarshak/tzofia)" };
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

type Ev = { id: string; time: string; lat: number; lon: number; mag: number | null; magtype: string | null;
  depth: number | null; region: string | null; type?: string | null; src: string[] };

async function setStatus(source: string, ok: boolean, count: number | null, error: string | null) {
  await sql`insert into public.source_status (source, last_ok, last_count, last_error, last_try)
            values (${source}, ${ok ? sql`now()` : null}, ${count}, ${error}, now())
            on conflict (source) do update set
              last_ok = coalesce(excluded.last_ok, public.source_status.last_ok),
              last_count = coalesce(excluded.last_count, public.source_status.last_count),
              last_error = excluded.last_error, last_try = excluded.last_try`;
}

async function getText(url: string) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
  if (r.status === 204) return "";
  const t = await r.text();
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${t.slice(0, 100)}`);
  return t;
}

async function emsc(start: string): Promise<Ev[]> {
  const t = await getText("https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=500&orderby=time" +
    `&minmag=${MIN_MAG}&start=${start}&minlat=${BBOX.s}&maxlat=${BBOX.n}&minlon=${BBOX.w}&maxlon=${BBOX.e}`);
  if (!t) return [];
  return (JSON.parse(t).features ?? []).map((f: any) => {
    const p = f.properties ?? {};
    return { id: "emsc-" + String(p.unid ?? f.id ?? ""), time: p.time, lat: Number(p.lat), lon: Number(p.lon),
      mag: p.mag == null ? null : Number(p.mag), magtype: p.magtype ?? null,
      depth: p.depth == null ? null : Math.abs(Number(p.depth)), region: p.flynn_region ?? null, type: p.evtype ?? null, src: ["emsc"] };
  });
}

async function usgs(start: string): Promise<Ev[]> {
  const t = await getText("https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=500&orderby=time" +
    `&minmagnitude=${MIN_MAG}&starttime=${start}&minlatitude=${BBOX.s}&maxlatitude=${BBOX.n}&minlongitude=${BBOX.w}&maxlongitude=${BBOX.e}`);
  if (!t) return [];
  return (JSON.parse(t).features ?? []).map((f: any) => {
    const p = f.properties ?? {}, c = f.geometry?.coordinates ?? [];
    return { id: "usgs-" + String(f.id ?? ""), time: new Date(Number(p.time)).toISOString(), lat: Number(c[1]), lon: Number(c[0]),
      mag: p.mag == null ? null : Number(p.mag), magtype: p.magType ?? null,
      depth: c[2] == null ? null : Math.abs(Number(c[2])), region: p.place ?? null,
      type: p.type ?? null, src: ["usgs"] };
  });
}

// the standard text answer of an FDSN event service (GFZ, NOA)
async function fdsnText(base: string, name: string, start: string): Promise<Ev[]> {
  const t = await getText(base + `?format=text&orderby=time&limit=500&minmagnitude=${MIN_MAG}&starttime=${start}` +
    `&minlatitude=${BBOX.s}&maxlatitude=${BBOX.n}&minlongitude=${BBOX.w}&maxlongitude=${BBOX.e}`);
  const out: Ev[] = [];
  for (const line of t.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const p = line.split("|");
    if (p.length < 13 || !p[10]) continue;
    const type = (p[13] ?? "").trim();
    if (type && type !== "earthquake") continue;          // quarry blasts and the like are left out
    out.push({ id: `${name}-${p[0]}`, time: p[1].slice(0, 23).replace(/Z?$/, "Z"), lat: Number(p[2]), lon: Number(p[3]),
      mag: Number(p[10]), magtype: p[9] || null, depth: p[4] ? Math.abs(Number(p[4])) : null, region: p[12] || null, src: [name] });
  }
  return out;
}

const km = (a: Ev, b: Ev) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
// the lists are merged in order of priority: the first service's figures are kept, the others are added as sources
function merge(lists: Ev[][]) {
  const out: Ev[] = [];
  for (const list of lists) for (const e of list) {
    const same = out.find((o) => Math.abs(Date.parse(o.time) - Date.parse(e.time)) < 90000 && km(o, e) < 150);
    if (same) { for (const s of e.src) if (!same.src.includes(s)) same.src.push(s); }
    else out.push({ ...e, src: [...e.src] });
  }
  return out.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

Deno.serve(async () => {
  try {
    const [last] = await sql`select computed_at from public.derived where key = 'quakes'`;
    if (last && Date.now() - new Date(last.computed_at).getTime() < 4 * 60 * 1000) return reply({ skipped: "fresh" });
    const start = new Date(Date.now() - HOURS * 3600 * 1000).toISOString().slice(0, 19);
    const sources: [string, () => Promise<Ev[]>][] = [
      ["emsc", () => emsc(start)],
      ["usgs", () => usgs(start)],
      ["gfz", () => fdsnText("https://geofon.gfz.de/fdsnws/event/1/query", "gfz", start)],
      ["noa", () => fdsnText("https://eida.gein.noa.gr/fdsnws/event/1/query", "noa", start)],
    ];
    const got = await Promise.allSettled(sources.map(([, f]) => f()));
    const lists: Ev[][] = [], counts: Record<string, number | string> = {};
    for (let i = 0; i < sources.length; i++) {
      const name = sources[i][0], g = got[i];
      if (g.status === "fulfilled") {
        const ok = g.value.filter((e) => e.id && e.time && Number.isFinite(e.lat) && Number.isFinite(e.lon) && Number.isFinite(Date.parse(e.time)));
        lists.push(ok); counts[name] = ok.length; await setStatus(name, true, ok.length, null);
      } else { counts[name] = "error"; await setStatus(name, false, null, String(g.reason).slice(0, 200)); }
    }
    if (!lists.length) return reply({ error: "no source answered", counts }, 502);
    const events = merge(lists);
    const data = { hours: HOURS, events };
    await sql`insert into public.derived (key, data, computed_at) values ('quakes', ${sql.json(data as never)}, now())
              on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at`;
    return reply({ events: events.length, counts });
  } catch (e) {
    return reply({ error: String(e).slice(0, 300) }, 500);
  }
});
