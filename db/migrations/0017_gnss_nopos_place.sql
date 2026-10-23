-- Tzofia 0017: place more of the aircraft that fly without a GPS position (Ilya, 23.10.2026, options 1 and 2).
-- For each aircraft in 'gnss_nopos' (altitude but no position, accuracy 0), in this order:
--   1. last position from the past 10 minutes: moved forward along its track at its ground speed;
--   2. otherwise, below 10,000 feet: it is landing at or taking off from Ben Gurion, so it is placed there;
--   3. otherwise, last position from the past 60 minutes: moved forward along its track at its ground speed.
-- An aircraft with none of these stays only in the count ('nopos').
-- Placements are kept for 60 minutes ('gnss_nopos_hist' in public.derived), the same window as the rest of the
-- grid, so an aircraft that was jammed over an area keeps counting there after it lands or moves on.
-- No delete statements.

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
  per as (
    select gy, gx, hex, bool_or(bad) as bad
    from (select gy, gx, hex, bad from s union all select gy, gx, hex, true from kept) z
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
                            'cells', coalesce(jsonb_agg(jsonb_build_array(gy, gx, good, bad)), '[]'::jsonb)),
         now()
  from cells
  on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at;
  select jsonb_array_length(d.data->'cells') into n from public.derived d where d.key = 'gnss_grid';
  return n;
end $$;
revoke all on function ingest.compute_gnss() from public, anon, authenticated;
