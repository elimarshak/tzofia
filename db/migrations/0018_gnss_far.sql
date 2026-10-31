-- Tzofia 0018: the navigation-interference grid also covers the far aircraft, out to about 4,000 km from Israel
-- (Ilya, 1.11.2026, asked for Iran and the Gulf states). Same formula and cells as before (gpsjam.org,
-- 0.4 x 0.5 degrees, 60 minutes, an aircraft counts only if it sent a good report in the past 6 hours).
-- The far aircraft come in one batch about every 3 minutes, so over the far area each aircraft is sampled about
-- 20 times an hour rather than every 15 seconds. Coverage there depends on volunteer receivers and is partial over Iran.
-- No new source, no new table, no delete statements.

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
           (l.nic < 7 or coalesce(l.nac_p, 7) < 7) as bad, extract(epoch from l.updated_at) as t
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
  fsave as (
    insert into public.derived (key, data, computed_at)
    select 'gnss_far',
           jsonb_build_object('t_last', (select max(t) from fnew),
                              's', coalesce((select jsonb_agg(jsonb_build_array(hex, gy, gx, bad::int, round(t::numeric))) from fs), '[]'::jsonb),
                              'ok', coalesce((select jsonb_object_agg(hex, round(t::numeric)) from fok), '{}'::jsonb)),
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
                            'cells', coalesce(jsonb_agg(jsonb_build_array(gy, gx, good, bad)), '[]'::jsonb)),
         now()
  from cells
  on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at;
  select jsonb_array_length(d.data->'cells') into n from public.derived d where d.key = 'gnss_grid';
  return n;
end $$;
revoke all on function ingest.compute_gnss() from public, anon, authenticated;
