-- Tzofia 0014: ships heard by our own home station go on the map (decided by Ilya on 15.10.2026).
-- The home server sends, every 30 seconds, the ships its ship receiver (AIS-catcher) heard in the last
-- 10 minutes to public.home_ships_ingest, with the same station key as 0013. They go into the same table
-- as the aisstream.io ships, so the site's ship layer shows them with no other change.

create or replace function public.home_ships_ingest(p_key text, p_data jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare ts timestamptz := now(); n integer; total integer;
begin
  if p_key is null or p_data is null
     or not exists (select 1 from ingest.station_keys k
                    where k.station = 'home' and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    return 'denied';
  end if;
  -- at most one batch every 10 seconds, at most 2,000 ships in a batch
  if exists (select 1 from public.source_status s where s.source = 'home-ais' and s.last_ok > ts - interval '10 seconds') then
    return 'busy';
  end if;
  total := coalesce(jsonb_array_length(p_data->'ships'), 0);
  if total > 2000 then return 'too big'; end if;

  with a as (
    select distinct on ((x->>'mmsi')::bigint)
      (x->>'mmsi')::bigint as mmsi,
      nullif(btrim(regexp_replace(coalesce(x->>'name', ''), '@+', '', 'g')), '') as name,
      (x->>'lat')::double precision as lat,
      (x->>'lon')::double precision as lon,
      case when (x->>'sog')::real >= 102.3 then null else (x->>'sog')::real end as sog,
      case when (x->>'cog')::real >= 360 then null else (x->>'cog')::real end as cog,
      case when (x->>'heading')::real >= 360 then null else (x->>'heading')::real end as heading,
      (x->>'nav')::smallint as nav,
      nullif((x->>'kind')::smallint, 0) as kind,
      nullif(btrim(regexp_replace(coalesce(x->>'dest', ''), '@+', '', 'g')), '') as dest,
      nullif(btrim(regexp_replace(coalesce(x->>'callsign', ''), '@+', '', 'g')), '') as callsign,
      ts - make_interval(secs => least(greatest(coalesce((x->>'age')::double precision, 0), 0), 600)) as t
    from jsonb_array_elements(coalesce(p_data->'ships', '[]'::jsonb)) x
    where (x->>'mmsi') ~ '^[0-9]{9}$'
      and (x->>'lat')::double precision between -90 and 90 and (x->>'lon')::double precision between -180 and 180
    order by (x->>'mmsi')::bigint, (x->>'age')::double precision
  ),
  up as (
    insert into public.ships_live as l (mmsi, name, lat, lon, sog, cog, heading, nav, kind, dest, callsign, t)
    select mmsi, name, lat, lon, sog, cog, heading, nav, kind, dest, callsign, t from a
    on conflict (mmsi) do update set
      name = coalesce(excluded.name, l.name), lat = excluded.lat, lon = excluded.lon,
      sog = excluded.sog, cog = excluded.cog, heading = excluded.heading, nav = excluded.nav,
      kind = coalesce(excluded.kind, l.kind), dest = coalesce(excluded.dest, l.dest),
      callsign = coalesce(excluded.callsign, l.callsign), t = excluded.t
    where l.t is null or excluded.t > l.t
    returning mmsi
  )
  select count(*) into n from up;

  insert into public.source_status as s (source, last_ok, last_count, last_error, last_try)
  values ('home-ais', ts, n, null, ts)
  on conflict (source) do update set last_ok = excluded.last_ok, last_count = excluded.last_count,
    last_error = null, last_try = excluded.last_try;
  return 'ok ' || n;
end $$;
revoke all on function public.home_ships_ingest(text, jsonb) from public;
grant execute on function public.home_ships_ingest(text, jsonb) to anon, authenticated;
