// Tzofia: ships. Listens to the AIS stream (aisstream.io) for about 40 seconds once a minute (pg_cron)
// and keeps the latest known position of every ship in public.ships_live.
// The key lives only in this project's function secrets (AISSTREAM_KEY); it never reaches the repository or the browser.
import postgres from "npm:postgres@3.4.5";

// [[south, west], [north, east]]: eastern Mediterranean, Black Sea straits, Red Sea, Persian Gulf, Arabian Sea coast
const BOXES = [[[11, 24], [42, 60]]];
const LISTEN_MS = 40000;
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const reply = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function setStatus(ok: boolean, count: number | null, error: string | null) {
  await sql`insert into public.source_status (source, last_ok, last_count, last_error, last_try)
            values ('aisstream', ${ok ? sql`now()` : null}, ${count}, ${error}, now())
            on conflict (source) do update set
              last_ok = coalesce(excluded.last_ok, public.source_status.last_ok),
              last_count = coalesce(excluded.last_count, public.source_status.last_count),
              last_error = excluded.last_error, last_try = excluded.last_try`;
}

type Ship = { mmsi: number; name: string | null; lat: number | null; lon: number | null; sog: number | null; cog: number | null;
  heading: number | null; nav: number | null; kind: number | null; dest: string | null; callsign: string | null; t: string | null };

Deno.serve(async () => {
  const key = Deno.env.get("AISSTREAM_KEY");
  if (!key) return reply({ error: "AISSTREAM_KEY is not set" }, 500);
  const ships = new Map<number, Ship>();
  let messages = 0, wsError = "";
  const get = (mmsi: number): Ship => {
    let s = ships.get(mmsi);
    if (!s) { s = { mmsi, name: null, lat: null, lon: null, sog: null, cog: null, heading: null, nav: null, kind: null, dest: null, callsign: null, t: null }; ships.set(mmsi, s); }
    return s;
  };
  const clean = (v: unknown) => { const x = String(v ?? "").replace(/@+/g, "").trim(); return x || null; };
  try {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      const timer = setTimeout(() => { try { ws.close(); } catch { /* closed */ } resolve(); }, LISTEN_MS);
      ws.onopen = () => ws.send(JSON.stringify({ APIKey: key.trim(), BoundingBoxes: BOXES,
        FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"] }));
      ws.onmessage = async (ev) => {
        try {
          const raw = typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text();
          const m = JSON.parse(raw);
          if (m.error) { wsError = String(m.error).slice(0, 120); return; }
          const meta = m.MetaData ?? {}, mmsi = Number(meta.MMSI);
          if (!mmsi) return;
          messages++;
          const s = get(mmsi);
          s.name = clean(meta.ShipName) ?? s.name;
          const p = m.Message?.PositionReport ?? m.Message?.StandardClassBPositionReport;
          if (p) {
            s.lat = Number(meta.latitude ?? p.Latitude); s.lon = Number(meta.longitude ?? p.Longitude);
            s.sog = p.Sog >= 102.3 ? null : Number(p.Sog); s.cog = p.Cog >= 360 ? null : Number(p.Cog);
            s.heading = p.TrueHeading >= 360 ? null : Number(p.TrueHeading);
            s.nav = p.NavigationalStatus ?? null; s.t = new Date().toISOString();
          }
          const st = m.Message?.ShipStaticData;
          if (st) { s.kind = st.Type ?? s.kind; s.dest = clean(st.Destination) ?? s.dest; s.callsign = clean(st.CallSign) ?? s.callsign; s.name = clean(st.Name) ?? s.name; }
        } catch { /* skip a bad message */ }
      };
      ws.onerror = () => { wsError = wsError || "connection error"; };
      ws.onclose = () => { clearTimeout(timer); resolve(); };
    });
    const rows = [...ships.values()].filter((s) => s.lat == null || (Math.abs(s.lat) <= 90 && Math.abs(s.lon!) <= 180));
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500);
      await sql`insert into public.ships_live ${sql(part as never, "mmsi", "name", "lat", "lon", "sog", "cog", "heading", "nav", "kind", "dest", "callsign", "t")}
                on conflict (mmsi) do update set
                  name = coalesce(excluded.name, public.ships_live.name),
                  lat = coalesce(excluded.lat, public.ships_live.lat), lon = coalesce(excluded.lon, public.ships_live.lon),
                  sog = case when excluded.t is not null then excluded.sog else public.ships_live.sog end,
                  cog = case when excluded.t is not null then excluded.cog else public.ships_live.cog end,
                  heading = case when excluded.t is not null then excluded.heading else public.ships_live.heading end,
                  nav = coalesce(excluded.nav, public.ships_live.nav), kind = coalesce(excluded.kind, public.ships_live.kind),
                  dest = coalesce(excluded.dest, public.ships_live.dest), callsign = coalesce(excluded.callsign, public.ships_live.callsign),
                  t = coalesce(excluded.t, public.ships_live.t)`;
    }
    const withPos = rows.filter((s) => s.t).length;
    await setStatus(!wsError && messages > 0, withPos, wsError || (messages ? null : "no messages received"));
    return reply({ messages, ships: rows.length, withPos, wsError });
  } catch (e) {
    await setStatus(false, null, String(e).slice(0, 120)).catch(() => {});
    return reply({ error: String(e).slice(0, 200), messages }, 500);
  }
});
