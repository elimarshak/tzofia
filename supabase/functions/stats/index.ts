// Tzofia: the numbers of our own visit counter, for Ilya's private page (web/stats.html).
//   GET ?p=today|yesterday|7|30   with header x-stats-key: <the password kept in the STATS_KEY secret>
// Days and hours are counted in Israel time. Lines from Ilya's own browsers (me = true) are left out.
// A visit ends after 30 minutes without activity (the site starts a new visit number then). "Left at once" means a
// visit with no minute-line and no action: the visitor closed the site within the first minute without doing anything.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const ORIGINS = ["https://openeye.co.il", "https://www.openeye.co.il"];
const TZ = "Asia/Jerusalem";

function same(a: string, b: string) {   // compares without telling how much of the password was right
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

// the start and end of each period, as SQL expressions in Israel time
const START = {
  today: sql`(date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ})`,
  yesterday: sql`(date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ} - interval '1 day')`,
  "7": sql`(now() - interval '7 days')`,
  "30": sql`(now() - interval '30 days')`,
} as const;
const END = {
  today: sql`now()`, yesterday: sql`(date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ})`, "7": sql`now()`, "30": sql`now()`,
} as const;
type P = keyof typeof START;

async function summary(p: P) {
  const [r] = await sql`
    with s as (
      select sid, vid, min(at) as s, max(at) as e,
             count(*) filter (where kind = 'ping') as pings, count(*) filter (where kind = 'event') as evs
      from ingest.visits where not me and at >= ${START[p]} and at < ${END[p]}
      group by sid, vid),
    firsts as (select vid, min(at) as first from ingest.visits where not me group by vid)
    select count(distinct s.vid)::int as people,
           count(distinct s.vid) filter (where f.first >= ${START[p]})::int as new_people,
           count(*)::int as visits,
           coalesce(round(percentile_cont(0.5) within group (order by extract(epoch from s.e - s.s)))::int, 0) as median_sec,
           coalesce(round(avg(extract(epoch from s.e - s.s)))::int, 0) as avg_sec,
           count(*) filter (where s.pings = 0 and s.evs = 0)::int as left_at_once
    from s join firsts f using (vid)`;
  return r;
}

async function breakdown(p: P) {
  const opens = sql`select * from ingest.visits where not me and kind = 'open' and at >= ${START[p]} and at < ${END[p]}`;
  const by = (col: string) => sql`
    select coalesce(${sql(col)}, '') as k, count(*)::int as visits, count(distinct vid)::int as people
    from (${opens}) o group by 1 order by visits desc limit 40`;
  const events = await sql`
    select name as k, count(*)::int as times, count(distinct vid)::int as people from ingest.visits
    where not me and kind = 'event' and at >= ${START[p]} and at < ${END[p]} group by 1 order by times desc limit 80`;
  const cities = await sql`
    select coalesce(city, '') as k, count(*)::int as visits, count(distinct vid)::int as people
    from (${opens}) o where country = 'IL' group by 1 order by visits desc limit 40`;
  const links = await sql`
    select path as k, count(*)::int as visits, count(distinct vid)::int as people
    from (${opens}) o where path is not null and path not in ('', '/') group by 1 order by visits desc limit 30`;
  // the same site under several addresses (m.facebook.com, l.facebook.com, google.co.il ...) is counted as one
  const refs = await sql`
    select k, count(*)::int as visits, count(distinct vid)::int as people from (
      select vid, case when ref is null then ''
                       when ref ~ '(^|\\.)facebook\\.com$' or ref in ('fb.com', 'fb.me') then 'facebook.com'
                       when ref ~ '(^|\\.)google\\.' then 'google'
                       when ref ~ '(^|\\.)instagram\\.com$' then 'instagram.com'
                       when ref in ('t.co', 'x.com', 'twitter.com', 'mobile.twitter.com') then 'x.com'
                       when ref ~ '(^|\\.)bing\\.com$' then 'bing.com'
                       else ref end as k
      from (${opens}) o) r
    group by k order by visits desc limit 40`;
  return {
    ref: refs, src: await by("src"), country: await by("country"), city: cities,
    dev: await by("dev"), os: await by("os"), lang: await by("lang"), theme: await by("theme"), links, events,
  };
}

Deno.serve(async (req) => {
  const o = req.headers.get("origin") ?? "";
  const h = { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "x-stats-key", "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin", "Cache-Control": "no-store" };
  const reply = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const key = Deno.env.get("STATS_KEY") ?? "";
  if (!key) return reply({ error: "nokey" }, 503);
  if (!same(req.headers.get("x-stats-key") ?? "", key)) {
    await new Promise((r) => setTimeout(r, 1500));   // slows down anyone trying passwords one after another
    return reply({ error: "denied" }, 401);
  }
  const q = new URL(req.url).searchParams.get("p") ?? "7";
  const p = (q in START ? q : "7") as P;
  try {
    const [live] = await sql`select count(distinct vid)::int as n from ingest.visits where not me and at > now() - interval '2 minutes'`;
    const periods = { "30": await summary("30"), "7": await summary("7"), yesterday: await summary("yesterday"), today: await summary("today") };
    const hours = await sql`
      select to_char(date_trunc('hour', at at time zone ${TZ}), 'YYYY-MM-DD"T"HH24') as k, count(distinct vid)::int as people
      from ingest.visits where not me and at > now() - interval '48 hours' group by 1 order by 1`;
    const days = await sql`
      select to_char(date_trunc('day', at at time zone ${TZ}), 'YYYY-MM-DD') as k, count(distinct vid)::int as people
      from ingest.visits where not me and at > now() - interval '30 days' group by 1 order by 1`;
    const [since] = await sql`select min(at) as first from ingest.visits`;
    return reply({ at: new Date().toISOString(), since: since?.first ?? null, live: live.n, periods, hours, days, p, by: await breakdown(p) });
  } catch (e) {
    return reply({ error: String(e).slice(0, 200) }, 500);
  }
});
