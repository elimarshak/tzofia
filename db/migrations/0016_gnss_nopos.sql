-- Tzofia 0016: the navigation-interference layer also counts aircraft that broadcast without a position (Ilya, 23.10.2026).
-- An aircraft whose GPS is jammed keeps sending its altitude, stops sending a position and reports position
-- accuracy 0. The positions table never sees it, so the grid missed exactly the worst cases.
-- 'gnss_nopos' in public.derived holds the identifiers of such aircraft heard in the last batch. Here:
--   * each of them with a known position from the last 10 minutes is counted as "bad" in that position's cell;
--   * all of them are counted in 'nopos', shown on the site as a number for the area.
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
  -- of these, the ones whose last position is recent enough to place them on the map
  npl as (
    select l.hex, floor(l.lat / 0.4)::int as gy, floor(l.lon / 0.5)::int as gx
    from np join public.aircraft_live l using (hex)
    where l.lat is not null and l.lon is not null and l.pos_time > now() - interval '10 minutes'
  ),
  per as (
    select gy, gx, hex, bool_or(bad) as bad
    from (select gy, gx, hex, bad from s union all select gy, gx, hex, true from npl) z
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
                            'cells', coalesce(jsonb_agg(jsonb_build_array(gy, gx, good, bad)), '[]'::jsonb)),
         now()
  from cells
  on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at;
  select jsonb_array_length(d.data->'cells') into n from public.derived d where d.key = 'gnss_grid';
  return n;
end $$;
revoke all on function ingest.compute_gnss() from public, anon, authenticated;
