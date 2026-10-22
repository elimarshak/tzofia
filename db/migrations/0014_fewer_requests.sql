-- Tzofia 0014: fewer and lighter requests to adsb.lol, so it has no reason to block us again (Ilya, 22.10.2026).
-- The aircraft over Israel keep coming every 30 seconds, exactly as before; only what is far away slows down.
--   point   : a small circle of 300 nm around 32.0N 34.9E, every 30 seconds. It covers the whole region
--             (250 nm, in_region) with a margin, so an aircraft leaving the region keeps moving on the map.
--   wide    : the big circle of 2,160 nm (about 4,000 km), every 2 minutes instead of every 30 seconds.
--   mil     : military aircraft worldwide, every 2 minutes (unchanged).
--   sqk7700, sqk7600, sqk7500 : emergencies worldwide, each every 4 minutes instead of every 2.
--             An emergency in the region still shows up at once, since it also comes with "point".
-- After a "too many requests" answer (HTTP 429) we stay away for 2 minutes, then 4, 8, 16 and at most 30
-- minutes while the answers stay 429, or longer if the source names a wait (Retry-After).
-- One request every 15 seconds at most, as before: 15 requests in every 4 minutes instead of 16, and the big
-- circle 2 times instead of 8.

create table if not exists ingest.backoff (
  id      integer primary key default 1 check (id = 1),
  strikes integer not null default 0,
  until   timestamptz not null default '-infinity'
);
insert into ingest.backoff (id) values (1) on conflict do nothing;
revoke all on ingest.backoff from public, anon, authenticated;

create or replace function ingest.fire(p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare u text; id bigint;
begin
  u := case p_kind
    when 'point'   then 'https://api.adsb.lol/v2/point/32.0/34.9/300'
    when 'wide'    then 'https://api.adsb.lol/v2/point/32.0/34.9/2160'
    when 'mil'     then 'https://api.adsb.lol/v2/mil'
    when 'sqk7700' then 'https://api.adsb.lol/v2/sqk/7700'
    when 'sqk7600' then 'https://api.adsb.lol/v2/sqk/7600'
    when 'sqk7500' then 'https://api.adsb.lol/v2/sqk/7500'
  end;
  if u is null then raise exception 'unknown kind %', p_kind; end if;
  -- never stack requests of the same kind
  if exists (select 1 from ingest.requests r where r.kind = p_kind and r.sent_at > now() - interval '20 seconds') then
    return;
  end if;
  id := net.http_get(url := u, timeout_milliseconds := 12000,
                     headers := '{"User-Agent":"tzofia/0.1 (+https://github.com/elimarshak/tzofia)"}'::jsonb);
  insert into ingest.requests (req_id, kind) values (id, p_kind);
  insert into public.source_status (source, last_try) values ('adsb.lol/' || p_kind, now())
    on conflict (source) do update set last_try = excluded.last_try;
end $$;
revoke all on function ingest.fire(text) from public, anon, authenticated;

create or replace function ingest.tick() returns text
language plpgsql security definer set search_path = '' as $$
declare k text; i bigint;
begin
  -- the source asked us to slow down: stay away until the wait is over
  if exists (select 1 from ingest.backoff b where b.until > now()) then
    return 'backoff';
  end if;
  i := nextval('ingest.tick_seq');
  -- 16 slots of 15 seconds = 4 minutes; one slot stays empty
  k := (array['point','mil','point','wide','point','sqk7700','point',null,
              'point','mil','point','wide','point','sqk7600','point','sqk7500'])[1 + (i % 16)];
  if k is null then return 'rest'; end if;
  perform ingest.fire(k);
  return k;
end $$;
revoke all on function ingest.tick() from public, anon, authenticated;

create or replace function ingest.process() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record; j jsonb; ts timestamptz; n integer; done integer := 0; src text; wait_s double precision;
begin
  for r in
    select q.req_id, q.kind, q.sent_at, p.status_code, p.content, p.timed_out, p.error_msg, p.headers
    from ingest.requests q join net._http_response p on p.id = q.req_id
    order by q.sent_at
  loop
    src := 'adsb.lol/' || r.kind;
    begin
      if r.status_code = 429 then
        -- count a new strike only when we are not already waiting (answers still on their way do not count)
        wait_s := case when coalesce(r.headers->>'retry-after', '') ~ '^\d{1,6}$'
                       then least((r.headers->>'retry-after')::double precision, 7200) else 0 end;
        update ingest.backoff b set
          strikes = b.strikes + 1,
          until = now() + greatest(make_interval(secs => wait_s),
                                   least(interval '30 minutes', interval '2 minutes' * power(2, b.strikes)))
        where b.id = 1 and b.until <= now();
      elsif r.status_code = 200 then
        update ingest.backoff set strikes = 0 where id = 1 and strikes > 0;
      end if;

      if r.status_code is distinct from 200 or r.content is null then
        update public.source_status set last_error = coalesce(r.error_msg, 'HTTP ' || coalesce(r.status_code::text, 'none'))
          where source = src;
      else
        j  := r.content::jsonb;
        ts := to_timestamp(((j->>'now')::double precision) / 1000.0);

        with a as (
          select
            lower(x->>'hex') as hex,
            nullif(btrim(x->>'flight'), '') as flight,
            x->>'r' as reg, x->>'t' as ac_type, x->>'desc' as descr, x->>'ownOp' as operator, x->>'category' as category,
            coalesce((x->>'lat')::double precision, (x->'lastPosition'->>'lat')::double precision) as lat,
            coalesce((x->>'lon')::double precision, (x->'lastPosition'->>'lon')::double precision) as lon,
            case when jsonb_typeof(x->'alt_baro') = 'number' then (x->>'alt_baro')::numeric::integer end as alt_baro,
            (x->>'alt_geom')::numeric::integer as alt_geom,
            coalesce(x->>'alt_baro' = 'ground', false) as on_ground,
            (x->>'gs')::real as gs, (x->>'track')::real as track,
            (x->>'baro_rate')::numeric::integer as baro_rate, (x->>'geom_rate')::numeric::integer as geom_rate,
            x->>'squawk' as squawk, x->>'emergency' as emergency,
            (x->>'nic')::smallint as nic, (x->>'nac_p')::smallint as nac_p,
            (coalesce((x->>'dbFlags')::integer, 0) & 1) = 1 as mil,
            x->>'type' as src_type,
            ts - make_interval(secs => coalesce((x->>'seen_pos')::double precision, (x->>'seen')::double precision, 0)) as pos_time
          from jsonb_array_elements(coalesce(j->'ac', '[]'::jsonb)) x
          where x->>'hex' is not null and left(x->>'hex', 1) <> '~'
        ),
        -- distance in nautical miles from the centre of the request (32.0N 34.9E), worked out here
        -- so that the history keeps covering exactly the old 250 nm circle
        d as (
          select a.*,
                 case when a.lat is null or a.lon is null then null else
                   2 * 3440.065 * asin(sqrt(power(sin(radians(a.lat - 32.0) / 2), 2)
                     + cos(radians(32.0)) * cos(radians(a.lat)) * power(sin(radians(a.lon - 34.9) / 2), 2))) end as dst
          from a
        ),
        up as (
          insert into public.aircraft_live as l
            (hex, flight, reg, ac_type, descr, operator, category, lat, lon, alt_baro, alt_geom, on_ground, gs, track,
             baro_rate, geom_rate, squawk, emergency, nic, nac_p, mil, src_type, in_region, in_wide, pos_time, updated_at)
          select distinct on (hex) hex, flight, reg, ac_type, descr, operator, category, lat, lon, alt_baro, alt_geom, on_ground,
             gs, track, baro_rate, geom_rate, squawk, emergency, nic, nac_p, mil or r.kind = 'mil', src_type,
             r.kind in ('point', 'wide') and coalesce(dst <= 250, false), r.kind in ('point', 'wide'), pos_time, ts
          from d
          on conflict (hex) do update set
            flight = coalesce(excluded.flight, l.flight), reg = coalesce(excluded.reg, l.reg),
            ac_type = coalesce(excluded.ac_type, l.ac_type), descr = coalesce(excluded.descr, l.descr),
            operator = coalesce(excluded.operator, l.operator), category = coalesce(excluded.category, l.category),
            lat = coalesce(excluded.lat, l.lat), lon = coalesce(excluded.lon, l.lon),
            alt_baro = excluded.alt_baro, alt_geom = excluded.alt_geom, on_ground = excluded.on_ground,
            gs = excluded.gs, track = excluded.track, baro_rate = excluded.baro_rate, geom_rate = excluded.geom_rate,
            squawk = excluded.squawk, emergency = excluded.emergency, nic = excluded.nic, nac_p = excluded.nac_p,
            mil = l.mil or excluded.mil, src_type = excluded.src_type,
            in_region = case when r.kind in ('point', 'wide') then excluded.in_region else l.in_region and l.updated_at > now() - interval '2 minutes' end,
            in_wide = case when r.kind in ('point', 'wide') then true else l.in_wide and l.updated_at > now() - interval '5 minutes' end,
            pos_time = coalesce(excluded.pos_time, l.pos_time), updated_at = excluded.updated_at
          where excluded.updated_at >= l.updated_at
          returning hex
        )
        select count(*) into n from up;

        -- our home station may already hold a newer position of some of these aircraft (then the row above
        -- was skipped); still take the details only this source has
        update public.aircraft_live l set
          reg = coalesce(l.reg, x->>'r'), ac_type = coalesce(l.ac_type, x->>'t'), descr = coalesce(l.descr, x->>'desc'),
          operator = coalesce(l.operator, x->>'ownOp'),
          mil = l.mil or (coalesce((x->>'dbFlags')::integer, 0) & 1) = 1 or r.kind = 'mil'
        from jsonb_array_elements(coalesce(j->'ac', '[]'::jsonb)) x
        where l.hex = lower(x->>'hex') and l.updated_at > ts
          and ((l.reg is null and x->>'r' is not null) or (l.ac_type is null and x->>'t' is not null)
               or (l.descr is null and x->>'desc' is not null) or (l.operator is null and x->>'ownOp' is not null)
               or (not l.mil and ((coalesce((x->>'dbFlags')::integer, 0) & 1) = 1 or r.kind = 'mil')));

        -- history: region aircraft only, thinned (the small circle brings them every 30 seconds)
        if r.kind = 'point' then
          with h as (
            insert into public.aircraft_positions (hex, t, lat, lon, alt_baro, alt_geom, gs, track, baro_rate, geom_rate, nic, nac_p, squawk)
            select l.hex, l.pos_time, l.lat, l.lon, l.alt_baro, l.alt_geom, l.gs::smallint, l.track::smallint,
                   l.baro_rate, l.geom_rate, l.nic, l.nac_p, l.squawk
            from public.aircraft_live l
            where l.updated_at = ts and l.in_region and l.lat is not null and l.pos_time is not null
              and l.pos_time > ts - interval '30 seconds'
              and (l.last_hist is null
                   or l.pos_time >= l.last_hist + interval '60 seconds'
                   or (abs(coalesce(l.baro_rate, l.geom_rate, 0)) >= 3000 and l.pos_time >= l.last_hist + interval '10 seconds'))
            on conflict do nothing
            returning hex, t
          )
          update public.aircraft_live l set last_hist = h.t from h where l.hex = h.hex;

          update public.aircraft_live set in_region = false
            where in_region and updated_at < ts - interval '2 minutes';
        end if;
        -- the big circle comes every 2 minutes, so a far aircraft is dropped only after it missed two of them
        if r.kind = 'wide' then
          update public.aircraft_live set in_wide = false
            where in_wide and updated_at < ts - interval '5 minutes';
        end if;

        -- emergencies: from any response
        insert into public.emergencies as e (hex, flight, reg, ac_type, squawk, emergency, first_seen, last_seen, lat, lon, alt_baro)
        select l.hex, l.flight, l.reg, l.ac_type, l.squawk, l.emergency, ts, ts, l.lat, l.lon, l.alt_baro
        from public.aircraft_live l
        where l.updated_at = ts
          and (l.squawk in ('7500','7600','7700') or coalesce(l.emergency, 'none') not in ('none', ''))
        on conflict (hex) where active do update set
          last_seen = excluded.last_seen, squawk = excluded.squawk, emergency = excluded.emergency,
          lat = excluded.lat, lon = excluded.lon, alt_baro = excluded.alt_baro, flight = coalesce(excluded.flight, e.flight);

        update public.source_status set last_ok = ts, last_count = n, last_error = null where source = src;
      end if;
    exception when others then
      update public.source_status set last_error = left(sqlerrm, 300) where source = src;
    end;
    delete from ingest.requests where req_id = r.req_id;
    delete from net._http_response where id = r.req_id;
    done := done + 1;
  end loop;

  -- requests that never got an answer
  delete from ingest.requests where sent_at < now() - interval '2 minutes';
  -- an emergency ends when the aircraft stops declaring it: after 5 minutes over the region, which is asked
  -- every 30 seconds, and after 10 minutes elsewhere, where the emergency lists are asked every 4 minutes
  update public.emergencies e set active = false
    where active and (last_seen < now() - interval '10 minutes'
      or (last_seen < now() - interval '5 minutes'
          and exists (select 1 from public.aircraft_live l where l.hex = e.hex and l.in_region)));
  return done;
end $$;
revoke all on function ingest.process() from public, anon, authenticated;
