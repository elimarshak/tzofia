// Tzofia: internet outages around the world in the last 7 days, as verified and published by Cloudflare Radar
// (Outage Center annotations, CC BY-NC 4.0). Runs every 15 minutes (pg_cron) and overwrites one JSON document
// that browsers read. The token lives only in this project's function secrets (CLOUDFLARE_RADAR_TOKEN).
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function setStatus(ok: boolean, count: number | null, error: string | null) {
  await sql`insert into public.source_status (source, last_ok, last_count, last_error, last_try)
            values ('cloudflare-radar', ${ok ? sql`now()` : null}, ${count}, ${error}, now())
            on conflict (source) do update set
              last_ok = coalesce(excluded.last_ok, public.source_status.last_ok),
              last_count = coalesce(excluded.last_count, public.source_status.last_count),
              last_error = excluded.last_error, last_try = excluded.last_try`;
}

Deno.serve(async (req) => {
  try {
    const token = Deno.env.get("CLOUDFLARE_RADAR_TOKEN");
    if (!token) return reply({ error: "CLOUDFLARE_RADAR_TOKEN is not set" }, 500);
    const [last] = await sql`select computed_at from public.derived where key = 'outages'`;
    if (last && Date.now() - new Date(last.computed_at).getTime() < 10 * 60 * 1000) return reply({ skipped: "fresh" });
    const r = await fetch("https://api.cloudflare.com/client/v4/radar/annotations/outages?dateRange=7d&limit=200&format=json",
      { headers: { Authorization: `Bearer ${token.trim()}` } });
    const text = await r.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    const list = body?.result?.annotations;
    if (r.status !== 200 || !Array.isArray(list)) {
      await setStatus(false, null, `HTTP ${r.status}: ${text.slice(0, 160).replaceAll(token.trim(), "***")}`);
      return reply({ error: r.status }, 502);
    }
    const events = list.map((a: any) => ({
      id: String(a.id ?? ""),
      start: a.startDate ?? null,
      end: a.endDate ?? null,
      countries: Array.isArray(a.locations) ? a.locations.map(String) : [],
      networks: Array.isArray(a.asnsDetails) ? a.asnsDetails.map((n: any) => ({ asn: n.asn, name: n.name ?? null })) : [],
      scope: a.scope ?? null,
      cause: a.outage?.outageCause ?? null,
      kind: a.outage?.outageType ?? null,
      text: typeof a.description === "string" ? a.description.slice(0, 600) : null,
      link: typeof a.linkedUrl === "string" && a.linkedUrl.startsWith("https://") ? a.linkedUrl : null,
    })).filter((e: any) => e.id && e.start);
    const data = { days: 7, events };
    await sql`insert into public.derived (key, data, computed_at) values ('outages', ${sql.json(data as never)}, now())
              on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at`;
    await setStatus(true, events.length, null);
    const peek = new URL(req.url).searchParams.get("peek") ? { keys: list[0] ? Object.keys(list[0]) : [], first: events[0] ?? null } : {};
    return reply({ events: events.length, ...peek });
  } catch (e) {
    return reply({ error: String(e).slice(0, 200) }, 500);
  }
});
