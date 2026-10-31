-- Tzofia 0021: a second aircraft source over the Gulf states and Iran, adsb.fi (Ilya, 1.11.2026, option 1).
-- airplanes.live was asked first and refuses requests without an email to them, so it is not used.
-- adsb.fi terms: personal, non-commercial use, at most 1 request a second, credit with a link to adsb.fi.
-- Ten circles of 250 nm (the largest the source allows) cover the Gulf states, Oman and Iran. One circle is asked
-- every tick (15 seconds), so each circle comes every 150 seconds: 4 requests a minute, well under the limit.
-- Its aircraft go into the same table as the far aircraft from adsb.lol ('in_wide'), so they show on the map and
-- count in the interference and spoofing calculation. adsb.lol is asked exactly as before (one big circle every
-- 3 minutes). adsb.fi has its own slow-down table, ingest.backoff_fi (ingest.backoff allows only the one row of adsb.lol),
-- so a refusal from one source never stops the other.
-- adsb.fi answers with 'aircraft' (not 'ac') and gives 'now' in seconds (adsb.lol in milliseconds).
-- No delete statements other than the ones the processing already had.

create table if not exists ingest.backoff_fi (
  id      integer primary key check (id = 1),
  strikes integer not null default 0,
  until   timestamptz not null default now()
);
alter table ingest.backoff_fi enable row level security;
revoke all on ingest.backoff_fi from public, anon, authenticated;
insert into ingest.backoff_fi (id) values (1) on conflict (id) do nothing;

create or replace function ingest.fire_fi(p_i integer) returns void
language plpgsql security definer set search_path = '' as $$
declare la double precision; lo double precision; id bigint;
begin
  select p[1], p[2] into la, lo from (select case p_i
      when 0 then array[29.5, 48.0]    -- Kuwait, Basra, Khuzestan
      when 1 then array[26.0, 51.5]    -- Bahrain, Qatar
      when 2 then array[24.5, 55.5]    -- the Emirates, the Strait of Hormuz
      when 3 then array[23.0, 58.5]    -- Oman
      when 4 then array[35.7, 51.4]    -- Tehran
      when 5 then array[32.0, 52.5]    -- Isfahan
      when 6 then array[28.5, 55.0]    -- Fars, Kerman, the southern coast
      when 7 then array[36.5, 59.0]    -- Mashhad
      when 8 then array[38.0, 46.3]    -- Tabriz
      when 9 then array[29.5, 61.0]    -- Sistan and Baluchestan
    end as p) q;
  if la is null then raise exception 'unknown circle %', p_i; end if;
  -- never stack requests to this source
  if exists (select 1 from ingest.requests r where r.kind = 'fi' and r.sent_at > now() - interval '10 seconds') then
    return;
  end if;
  id := net.http_get(url := format('https://opendata.adsb.fi/api/v2/lat/%s/lon/%s/dist/250', la, lo),
                     timeout_milliseconds := 20000,
                     headers := '{"User-Agent":"tzofia/0.1 (+https://github.com/elimarshak/tzofia)"}'::jsonb);
  insert into ingest.requests (req_id, kind) values (id, 'fi');
  insert into public.source_status (source, last_try) values ('adsb.fi', now())
    on conflict (source) do update set last_try = excluded.last_try;
end $$;
revoke all on function ingest.fire_fi(integer) from public, anon, authenticated;

create or replace function ingest.tick() returns text
language plpgsql security definer set search_path = '' as $$
declare i bigint; res text := 'rest';
begin
  i := nextval('ingest.tick_seq');
  -- adsb.fi: one of the ten circles over the Gulf states and Iran on every tick, unless it asked us to slow down
  if not exists (select 1 from ingest.backoff_fi b where b.until > now()) then
    perform ingest.fire_fi((i % 10)::integer);
    res := 'fi';
  end if;
  -- adsb.lol asked us to slow down: stay away until the wait is over
  if exists (select 1 from ingest.backoff b where b.id = 1 and b.until > now()) then
    return res || ' backoff';
  end if;
  -- the tick runs every 15 seconds: 12 ticks = 3 minutes, one request to adsb.lol in each
  if i % 12 <> 0 then return res; end if;
  -- a far aircraft leaves the map only after it missed two big circles
  update public.aircraft_live set in_wide = false
    where in_wide and updated_at < now() - interval '7 minutes';
  perform ingest.fire('point');
  return 'point';
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
    src := case when r.kind = 'fi' then 'adsb.fi' else 'adsb.lol/' || r.kind end;
    begin
      if r.status_code = 429 then
        wait_s := case when coalesce(r.headers->>'retry-after', '') ~ '^\d{1,6}$'
                       then least((r.headers->>'retry-after')::double precision, 7200) else 0 end;
        if r.kind = 'fi' then
          update ingest.backoff_fi b set
            strikes = b.strikes + 1,
            until = now() + greatest(make_interval(secs => wait_s),
                                     least(interval '30 minutes', interval '2 minutes' * power(2, b.strikes)))
          where b.id = 1 and b.until <= now();
        else
          update ingest.backoff b set
            strikes = b.strikes + 1,
            until = now() + greatest(make_interval(secs => wait_s),
                                     least(interval '30 minutes', interval '2 minutes' * power(2, b.strikes)))
          where b.id = 1 and b.until <= now();
        end if;
      elsif r.status_code = 200 then
        if r.kind = 'fi' then
          update ingest.backoff_fi set strikes = 0 where id = 1 and strikes > 0;
        else
          update ingest.backoff set strikes = 0 where id = 1 and strikes > 0;
        end if;
      end if;

      if r.status_code is distinct from 200 or r.content is null then
        update public.source_status set last_error = coalesce(r.error_msg, 'HTTP ' || coalesce(r.status_code::text, 'none'))
          where source = src;
      else
        j  := r.content::jsonb;
        -- adsb.lol gives milliseconds, adsb.fi seconds
        ts := to_timestamp(case when (j->>'now')::double precision > 1e11
                                then (j->>'now')::double precision / 1000.0 else (j->>'now')::double precision end);

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
          from jsonb_array_elements(coalesce(j->'ac', j->'aircraft', '[]'::jsonb)) x
          where x->>'hex' is not null and left(x->>'hex', 1) <> '~'
        ),
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
             r.kind in ('point', 'wide', 'fi') and coalesce(dst <= 250, false), r.kind in ('point', 'wide', 'fi'), pos_time, ts
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
            in_region = case when r.kind in ('point', 'wide', 'fi') then excluded.in_region else l.in_region and l.updated_at > now() - interval '2 minutes' end,
            in_wide = case when r.kind in ('point', 'wide', 'fi') then true else l.in_wide and l.updated_at > now() - interval '5 minutes' end,
            pos_time = coalesce(excluded.pos_time, l.pos_time), updated_at = excluded.updated_at
          where excluded.updated_at >= l.updated_at
          returning hex
        )
        select count(*) into n from up;

        update public.aircraft_live l set
          reg = coalesce(l.reg, x->>'r'), ac_type = coalesce(l.ac_type, x->>'t'), descr = coalesce(l.descr, x->>'desc'),
          operator = coalesce(l.operator, x->>'ownOp'),
          mil = l.mil or (coalesce((x->>'dbFlags')::integer, 0) & 1) = 1 or r.kind = 'mil'
        from jsonb_array_elements(coalesce(j->'ac', j->'aircraft', '[]'::jsonb)) x
        where l.hex = lower(x->>'hex') and l.updated_at > ts
          and ((l.reg is null and x->>'r' is not null) or (l.ac_type is null and x->>'t' is not null)
               or (l.descr is null and x->>'desc' is not null) or (l.operator is null and x->>'ownOp' is not null)
               or (not l.mil and ((coalesce((x->>'dbFlags')::integer, 0) & 1) = 1 or r.kind = 'mil')));

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
        if r.kind = 'wide' then
          update public.aircraft_live set in_wide = false
            where in_wide and updated_at < ts - interval '5 minutes';
        end if;

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

  delete from ingest.requests where sent_at < now() - interval '2 minutes';
  update public.emergencies e set active = false
    where active and (last_seen < now() - interval '10 minutes'
      or (last_seen < now() - interval '5 minutes'
          and exists (select 1 from public.aircraft_live l where l.hex = e.hex and l.in_region)));
  return done;
end $$;
revoke all on function ingest.process() from public, anon, authenticated;
