-- Tzofia 0011: aircraft out to about 4,000 km from Israel (decided by Ilya on 14.10.2026).
-- The request to adsb.lol grows from a 250 nm circle to a 2,160 nm circle (about 4,000 km).
-- in_region keeps its old meaning (within 250 nm, about 460 km): only those aircraft get
-- position history, so the trail line, the emptying-skies count and the navigation
-- interference grid keep covering the same area as before.
-- in_wide marks every aircraft from the big circle; the site draws them on the map.

alter table public.aircraft_live add column if not exists in_wide boolean not null default false;
create index if not exists aircraft_live_wide_idx on public.aircraft_live (in_wide, updated_at desc);

create or replace function ingest.fire(p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare u text; id bigint;
begin
  u := case p_kind
    when 'point'   then 'https://api.adsb.lol/v2/point/32.0/34.9/2160'
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

create or replace function ingest.process() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record; j jsonb; ts timestamptz; n integer; done integer := 0; src text;
begin
  for r in
    select q.req_id, q.kind, q.sent_at, p.status_code, p.content, p.timed_out, p.error_msg
    from ingest.requests q join net._http_response p on p.id = q.req_id
    order by q.sent_at
  loop
    src := 'adsb.lol/' || r.kind;
    begin
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
             r.kind = 'point' and coalesce(dst <= 250, false), r.kind = 'point', pos_time, ts
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
            in_region = case when r.kind = 'point' then excluded.in_region else l.in_region and l.updated_at > now() - interval '2 minutes' end,
            in_wide = case when r.kind = 'point' then true else l.in_wide and l.updated_at > now() - interval '2 minutes' end,
            pos_time = coalesce(excluded.pos_time, l.pos_time), updated_at = excluded.updated_at
          where excluded.updated_at >= l.updated_at
          returning hex
        )
        select count(*) into n from up;

        -- history: region aircraft only, thinned
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
          update public.aircraft_live set in_wide = false
            where in_wide and updated_at < ts - interval '2 minutes';
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
  -- an emergency ends when the aircraft stops declaring it for five minutes
  update public.emergencies set active = false where active and last_seen < now() - interval '5 minutes';
  return done;
end $$;

revoke all on function ingest.fire(text), ingest.process() from public, anon, authenticated;
