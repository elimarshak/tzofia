// Tzofia: which satellites are over the map area now and in the next few minutes.
// Runs every 5 minutes (pg_cron). The public catalogue (CelesTrak "active" group) is downloaded by our
// scheduled GitHub workflow onto the data branch; this function reads that copy, at most once an hour,
// and publishes only the satellites whose ground point is about to be inside the map area,
// so phones propagate a few hundred objects, not 16,000.
import postgres from "npm:postgres@3.4.5";
import * as satellite from "npm:satellite.js@7.1.0";

const BBOX = { w: 26, s: 25, e: 42, n: 38 }; // same box as the basemap
const MARGIN_DEG = 4;
const LOOKAHEAD_MIN = 10;
const REFETCH_MIN = 60;
const SRC = "https://raw.githubusercontent.com/elimarshak/tzofia/data/celestrak_active.csv";
const NUM = ["MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY",
  "EPHEMERIS_TYPE", "NORAD_CAT_ID", "ELEMENT_SET_NO", "REV_AT_EPOCH", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"];

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out;
}

async function setStatus(ok: boolean, count: number | null, error: string | null) {
  await sql`insert into public.source_status (source, last_ok, last_count, last_error, last_try)
            values ('satellites', ${ok ? sql`now()` : null}, ${count}, ${error}, now())
            on conflict (source) do update set
              last_ok = coalesce(excluded.last_ok, public.source_status.last_ok),
              last_count = coalesce(excluded.last_count, public.source_status.last_count),
              last_error = excluded.last_error, last_try = excluded.last_try`;
}

Deno.serve(async () => {
  const t0 = performance.now();
  try {
    const [last] = await sql`select computed_at from public.derived where key = 'sats_region'`;
    if (last && Date.now() - new Date(last.computed_at).getTime() < 4 * 60 * 1000) return reply({ skipped: "fresh" });

    let [blob] = await sql`select body, fetched_at from ingest.blobs where key = 'celestrak_active'`;
    const ageMin = blob ? (Date.now() - new Date(blob.fetched_at).getTime()) / 60000 : Infinity;
    let fetched = "no";
    if (ageMin > REFETCH_MIN) {
      const r = await fetch(SRC, { cache: "no-store" });
      const body = await r.text();
      if (r.status === 200 && body.startsWith("OBJECT_NAME")) {
        await sql`insert into ingest.blobs (key, body, fetched_at) values ('celestrak_active', ${body}, now())
                  on conflict (key) do update set body = excluded.body, fetched_at = excluded.fetched_at`;
        blob = { body, fetched_at: new Date() };
        fetched = "yes";
      } else {
        await setStatus(false, null, `HTTP ${r.status}: ${body.slice(0, 120)}`);
        fetched = "error";
      }
    }
    if (!blob) return reply({ error: "no catalogue yet", fetched }, 503);

    const lines = (blob.body as string).split(/\r?\n/).filter(Boolean);
    const head = splitCsvLine(lines[0]);
    const now = Date.now();
    const times = Array.from({ length: LOOKAHEAD_MIN + 1 }, (_, i) => new Date(now + i * 60000));
    const gmst = times.map((t) => satellite.gstime(t));
    const kept: Record<string, unknown>[] = [];
    let total = 0;
    for (let n = 1; n < lines.length; n++) {
      const cells = splitCsvLine(lines[n]);
      if (cells.length < head.length) continue;
      const omm: Record<string, unknown> = {};
      head.forEach((k, i) => { omm[k] = NUM.includes(k) ? Number(cells[i]) : cells[i]; });
      let rec;
      try { rec = satellite.json2satrec(omm as never); } catch { continue; }
      if (!rec || rec.error) continue;
      total++;
      for (let i = 0; i < times.length; i++) {
        const pv = satellite.propagate(rec, times[i]);
        const p = pv && pv.position;
        if (!p || typeof p !== "object") break;
        const g = satellite.eciToGeodetic(p, gmst[i]);
        const lat = satellite.degreesLat(g.latitude), lon = satellite.degreesLong(g.longitude);
        if (lat > BBOX.s - MARGIN_DEG && lat < BBOX.n + MARGIN_DEG && lon > BBOX.w - MARGIN_DEG && lon < BBOX.e + MARGIN_DEG) {
          kept.push(omm); break;
        }
      }
    }
    const data = { catalogue_time: new Date(blob.fetched_at).toISOString(), total, lookahead_min: LOOKAHEAD_MIN, sats: kept };
    await sql`insert into public.derived (key, data, computed_at) values ('sats_region', ${sql.json(data as never)}, now())
              on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at`;
    if (fetched !== "error") await setStatus(true, total, null);
    return reply({ fetched, total, kept: kept.length, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    return reply({ error: String(e).slice(0, 300), ms: Math.round(performance.now() - t0) }, 500);
  }
});
