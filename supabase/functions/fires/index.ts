// Tzofia: heat spots seen from space in the last 24 hours (NASA FIRMS, VIIRS instrument on NOAA-20).
// Runs every 30 minutes (pg_cron) and overwrites one JSON document that browsers read.
// The key lives only in this project's function secrets (FIRMS_MAP_KEY); it never reaches the repository or the browser.
import postgres from "npm:postgres@3.4.5";

const BBOX = "-18,12,64,43"; // west,south,east,north: Middle East, North Africa, Mediterranean
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function setStatus(ok: boolean, count: number | null, error: string | null) {
  await sql`insert into public.source_status (source, last_ok, last_count, last_error, last_try)
            values ('firms', ${ok ? sql`now()` : null}, ${count}, ${error}, now())
            on conflict (source) do update set
              last_ok = coalesce(excluded.last_ok, public.source_status.last_ok),
              last_count = coalesce(excluded.last_count, public.source_status.last_count),
              last_error = excluded.last_error, last_try = excluded.last_try`;
}

Deno.serve(async () => {
  try {
    const key = Deno.env.get("FIRMS_MAP_KEY");
    if (!key) return reply({ error: "FIRMS_MAP_KEY is not set" }, 500);
    const [last] = await sql`select computed_at from public.derived where key = 'fires'`;
    if (last && Date.now() - new Date(last.computed_at).getTime() < 20 * 60 * 1000) return reply({ skipped: "fresh" });
    const r = await fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key.trim()}/VIIRS_NOAA20_NRT/${BBOX}/2`);
    const text = await r.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const head = (lines[0] ?? "").split(",");
    const col = (n: string) => head.indexOf(n);
    if (r.status !== 200 || col("latitude") < 0) {
      await setStatus(false, null, `HTTP ${r.status}: ${text.slice(0, 100).replaceAll(key.trim(), "***")}`);
      return reply({ error: r.status }, 502);
    }
    const iLat = col("latitude"), iLon = col("longitude"), iD = col("acq_date"), iT = col("acq_time"),
      iC = col("confidence"), iF = col("frp"), iN = col("daynight");
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const spots: unknown[] = [];
    for (let n = 1; n < lines.length; n++) {
      const c = lines[n].split(",");
      const hhmm = c[iT].padStart(4, "0");
      const t = Date.parse(`${c[iD]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
      if (!(t >= cutoff) || c[iC] === "l") continue;     // last 24 hours, and not the low-confidence detections
      // [lat, lon, power in megawatts, confidence n|h, minutes since epoch, D|N]
      spots.push([+(+c[iLat]).toFixed(3), +(+c[iLon]).toFixed(3), Math.round(+c[iF] * 10) / 10, c[iC], Math.round(t / 60000), c[iN]]);
    }
    const data = { hours: 24, spots };
    await sql`insert into public.derived (key, data, computed_at) values ('fires', ${sql.json(data as never)}, now())
              on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at`;
    await setStatus(true, spots.length, null);
    return reply({ spots: spots.length, rows: lines.length - 1, head });
  } catch (e) {
    return reply({ error: String(e).slice(0, 200) }, 500);
  }
});
