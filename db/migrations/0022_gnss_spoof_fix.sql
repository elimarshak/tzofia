-- Tzofia 0022: fix the spoofing check of 0020 (1.11.2026). Some aircraft come without a ground speed (seen with
-- adsb.fi); 0020 counted a missing speed as zero, so a high aircraft with no speed field was flagged as "almost no
-- speed", and every move of such an aircraft looked like a jump. Now an aircraft without a speed is left out of the check.
-- The jump rule is also stricter, because a position that was stale for a few minutes and then refreshed also looks
-- like a jump: the position must be more than 100 km away from where the aircraft could have reached at its speed,
-- AND the jump must point more than 45 degrees away from the direction the aircraft reports it is flying.
-- Events found before this fix are dropped. No new table, no delete statements.

create or replace function ingest.compute_gnss() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with ok as (
    select distinct p.hex from public.aircraft_positions p
    where p.t > now() - interval '6 hours' and p.alt_baro is not null
      and p.nic >= 7 and coalesce(p.nac_p, 7) >= 7
  ),
  s as (
    select p.hex, floor(p.lat / 0.4)::int as gy, floor(p.lon / 0.5)::int as gx,
           (p.nic < 7 or coalesce(p.nac_p, 7) < 7) as bad
    from public.aircraft_positions p join ok using (hex)
    where p.t > now() - interval '60 minutes' and p.alt_baro is not null and p.nic is not null
  ),
  -- aircraft without a position right now (their GPS is not working)
  np as (
    select distinct lower(x) as hex
    from public.derived d, jsonb_array_elements_text(d.data->'hex') x
    where d.key = 'gnss_nopos' and d.computed_at > now() - interval '2 minutes'
  ),
  -- what we know about each of them; age of the last position in seconds
  k as (
    select np.hex, l.lat, l.lon, l.alt_baro, coalesce(l.gs, 0) as gs, l.track,
           extract(epoch from (now() - l.pos_time)) as age
    from np left join public.aircraft_live l using (hex)
  ),
  -- the estimated position: dead reckoning (distance in nautical miles = knots * hours) or Ben Gurion
  est as (
    select hex,
      case when lat is not null and age <= 600 then 'track'
           when coalesce(alt_baro, 99999) <= 10000 then 'llbg'
           when lat is not null and age <= 3600 then 'track' end as how,
      lat, lon, gs, track, age
    from k
  ),
  npl as (
    select hex,
      floor(case when how = 'llbg' then 32.0114
                 else lat + (gs * age / 3600.0) / 60.0 * cos(radians(coalesce(track, 0))) * (track is not null)::int end
            / 0.4)::int as gy,
      floor(case when how = 'llbg' then 34.8867
                 else lon + (gs * age / 3600.0) / 60.0 * sin(radians(coalesce(track, 0))) * (track is not null)::int
                          / greatest(cos(radians(lat)), 0.1) end
            / 0.5)::int as gx
    from est where how is not null
  ),
  -- placements of the last 60 minutes, together with the new ones
  hist as (
    select x->>0 as hex, (x->>1)::int as gy, (x->>2)::int as gx, (x->>3)::double precision as t
    from public.derived d, jsonb_array_elements(d.data->'p') x
    where d.key = 'gnss_nopos_hist' and (x->>3)::double precision > extract(epoch from now()) - 3600
    union all
    select hex, gy, gx, extract(epoch from now()) from npl
  ),
  kept as (
    select hex, gy, gx, max(t) as t from hist group by 1, 2, 3
  ),
  save as (
    insert into public.derived (key, data, computed_at)
    select 'gnss_nopos_hist',
           jsonb_build_object('p', coalesce(jsonb_agg(jsonb_build_array(hex, gy, gx, round(t::numeric))), '[]'::jsonb)), now()
    from kept
    on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at
    returning 1
  ),
  -- Aircraft beyond about 460 km and up to about 4,000 km (Ilya, 1.11.2026: shade Iran, the Gulf states and the
  -- rest of the far area too). Their positions are not kept in aircraft_positions, so the samples of the past hour
  -- and the aircraft seen with good accuracy in the past 6 hours are kept in one row, 'gnss_far' in public.derived,
  -- which is overwritten (nothing is deleted). A new far batch arrives about every 3 minutes; the row is rewritten
  -- only when one has arrived.
  fh as (
    select d.data from public.derived d where d.key = 'gnss_far'
  ),
  flast as (
    select coalesce((select (fh.data->>'t_last')::double precision from fh), 0) as t_last
  ),
  fnew as (
    select l.hex, floor(l.lat / 0.4)::int as gy, floor(l.lon / 0.5)::int as gx,
           (l.nic < 7 or coalesce(l.nac_p, 7) < 7) as bad, extract(epoch from l.updated_at) as t,
           l.lat, l.lon, l.gs, l.track, l.alt_baro, l.src_type, extract(epoch from l.pos_time) as tp
    from public.aircraft_live l, flast
    where l.in_wide and not l.in_region and l.lat is not null and not l.on_ground and l.alt_baro is not null
      and l.nic is not null and l.pos_time > l.updated_at - interval '2 minutes'
      and l.updated_at > now() - interval '5 minutes'
      and extract(epoch from l.updated_at) > flast.t_last
  ),
  fs as (
    select hex, gy, gx, bool_or(bad) as bad, max(t) as t
    from (select x->>0 as hex, (x->>1)::int as gy, (x->>2)::int as gx, (x->>3) = '1' as bad,
                 (x->>4)::double precision as t
          from fh, jsonb_array_elements(fh.data->'s') x
          union all
          select hex, gy, gx, bad, t from fnew) z
    where t > extract(epoch from now()) - 3600
    group by 1, 2, 3
  ),
  fok as (
    select hex, max(t) as t
    from (select e.key as hex, e.value::double precision as t from fh, jsonb_each_text(fh.data->'ok') e
          union all
          select hex, t from fnew where not bad) z
    where t > extract(epoch from now()) - 6 * 3600
    group by 1
  ),
  -- Position spoofing over the Gulf states and Iran (Ilya, 1.11.2026). An aircraft whose false GPS position looks
  -- accurate is not caught by the accuracy fields above, so here we look at how its position moves between two
  -- far batches (about 3 minutes apart): a position that jumped further than the aircraft could have flown at its
  -- reported speed, or a high aircraft that reports almost no speed (the rule the site already uses for one aircraft).
  -- The event is placed where the aircraft last was before the jump, on cells of 1 x 1 degree. Only ADS-B positions
  -- (not multilateration), only inside 22-40 N and 43-64 E. Events and last positions are kept 60 and 15 minutes,
  -- in the same overwritten 'gnss_far' row.
  fprev as (
    select e.key as hex, (e.value->>0)::double precision as lat, (e.value->>1)::double precision as lon,
           (e.value->>2)::double precision as tp, (e.value->>3)::double precision as gs
    from fh, jsonb_each(fh.data->'last') e
  ),
  fcur as (
    select distinct on (hex) hex, lat, lon, tp, gs, track, alt_baro from fnew
    where lat between 22 and 40 and lon between 43 and 64 and coalesce(src_type, '') like 'adsb%' and tp is not null
      and gs is not null
    order by hex, tp desc
  ),
  jumps as (
    select c.hex, p.lat as plat, p.lon as plon, c.tp, c.tp - p.tp as dt,
           2 * 6371 * asin(sqrt(power(sin(radians(c.lat - p.lat) / 2), 2)
             + cos(radians(p.lat)) * cos(radians(c.lat)) * power(sin(radians(c.lon - p.lon) / 2), 2))) as d_km,
           greatest(c.gs, p.gs) * 1.852 as v_km_h,
           -- the direction of the jump against the direction the aircraft reports it is flying
           abs(mod((degrees(atan2(sin(radians(c.lon - p.lon)) * cos(radians(c.lat)),
                   cos(radians(p.lat)) * sin(radians(c.lat))
                   - sin(radians(p.lat)) * cos(radians(c.lat)) * cos(radians(c.lon - p.lon))))
                   - coalesce(c.track, 0) + 540)::numeric, 360) - 180) as off_track,
           c.track
    from fcur c join fprev p using (hex)
    where c.tp - p.tp between 30 and 900
  ),
  spnew as (
    select hex, floor(plat)::int as gy, floor(plon)::int as gx, tp as t from jumps
    where d_km - v_km_h * dt / 3600.0 > 100 and track is not null and off_track > 45
    union all
    select hex, floor(lat)::int, floor(lon)::int, tp from fcur where alt_baro > 15000 and gs < 60
  ),
  sp as (
    select hex, gy, gx, max(t) as t
    from (select x->>0 as hex, (x->>1)::int as gy, (x->>2)::int as gx, (x->>3)::double precision as t
          from fh, jsonb_array_elements(fh.data->'sp') x
          union all select hex, gy, gx, t from spnew) z
    where t > extract(epoch from now()) - 3600
      and t > extract(epoch from timestamptz '2026-10-31 23:15:00+00')   -- events found before the 0022 fix are dropped
    group by 1, 2, 3
  ),
  flastpos as (
    select hex, lat, lon, tp, gs from fcur
    union all
    select p.hex, p.lat, p.lon, p.tp, p.gs from fprev p
    where p.tp > extract(epoch from now()) - 900 and not exists (select 1 from fcur c where c.hex = p.hex)
  ),
  fsave as (
    insert into public.derived (key, data, computed_at)
    select 'gnss_far',
           jsonb_build_object('t_last', (select max(t) from fnew),
                              's', coalesce((select jsonb_agg(jsonb_build_array(hex, gy, gx, bad::int, round(t::numeric))) from fs), '[]'::jsonb),
                              'ok', coalesce((select jsonb_object_agg(hex, round(t::numeric)) from fok), '{}'::jsonb),
                              'sp', coalesce((select jsonb_agg(jsonb_build_array(hex, gy, gx, round(t::numeric))) from sp), '[]'::jsonb),
                              'last', coalesce((select jsonb_object_agg(hex, jsonb_build_array(round(lat::numeric, 4), round(lon::numeric, 4), round(tp::numeric), round(gs::numeric))) from flastpos), '{}'::jsonb)),
           now()
    where exists (select 1 from fnew)
    on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at
    returning 1
  ),
  far as (
    select fs.gy, fs.gx, fs.hex, fs.bad from fs
    where exists (select 1 from fok where fok.hex = fs.hex) or exists (select 1 from ok where ok.hex = fs.hex)
  ),
  per as (
    select gy, gx, hex, bool_or(bad) as bad
    from (select gy, gx, hex, bad from s union all select gy, gx, hex, true from kept
          union all select gy, gx, hex, bad from far) z
    group by 1, 2, 3
  ),
  cells as (
    select gy, gx, count(*) filter (where not bad) as good, count(*) filter (where bad) as bad
    from per group by 1, 2
  )
  insert into public.derived (key, data, computed_at)
  select 'gnss_grid',
         jsonb_build_object('window_min', 60, 'dlat', 0.4, 'dlon', 0.5,
                            'aircraft', (select count(distinct hex) from per),
                            'nopos', (select count(*) from np),
                            'nopos_placed', (select count(*) from npl),
                            'nopos_hour', (select count(distinct hex) from kept) + 0 * (select count(*) from save),
                            'far_aircraft', (select count(distinct hex) from far) + 0 * (select count(*) from fsave),
                            'cells_all', count(*),
                            'spoof_d', 1.0,
                            'spoof', coalesce((select jsonb_agg(jsonb_build_array(q.gy, q.gx, q.planes)) from
                                                (select gy, gx, count(distinct hex) as planes from sp group by 1, 2) q
                                              where q.planes >= 2), '[]'::jsonb),
                            'spoof_aircraft', (select count(distinct hex) from sp),
                            'cells', coalesce(jsonb_agg(jsonb_build_array(gy, gx, good, bad)) filter (where bad >= 2), '[]'::jsonb)),
         now()
  from cells
  on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at;
  select jsonb_array_length(d.data->'cells') into n from public.derived d where d.key = 'gnss_grid';
  return n;
end $$;
revoke all on function ingest.compute_gnss() from public, anon, authenticated;
