-- Navigation-interference grid, computed by us from the positions we already store.
-- Method (docs/research/1-aircraft-gnss.md, section C):
--   * a position report is "bad" when NIC < 7 or NACp < 7 (airborne reports only);
--   * an aircraft is counted only if it also sent a good report in the last 6 hours
--     (drops aircraft whose equipment always reports low values);
--   * per cell and per 60-minute window: percent = 100 * (bad - 1) / (good + bad)  (gpsjam.org formula).
-- Cells are 0.4 deg latitude x 0.5 deg longitude (about 44 x 47 km at Israel's latitude).
-- The result is one small JSON document that browsers read; nothing is deleted, the row is overwritten.

create table if not exists public.derived (
  key          text primary key,
  data         jsonb not null,
  computed_at  timestamptz not null default now()
);
alter table public.derived enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'derived' and policyname = 'public read') then
    create policy "public read" on public.derived for select to anon, authenticated using (true);
  end if;
end $$;
grant select on public.derived to anon, authenticated;

create index if not exists aircraft_positions_t_idx on public.aircraft_positions (t);

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
  per as (select gy, gx, hex, bool_or(bad) as bad from s group by 1, 2, 3),
  cells as (
    select gy, gx, count(*) filter (where not bad) as good, count(*) filter (where bad) as bad
    from per group by 1, 2
  )
  insert into public.derived (key, data, computed_at)
  select 'gnss_grid',
         jsonb_build_object('window_min', 60, 'dlat', 0.4, 'dlon', 0.5,
                            'aircraft', (select count(distinct hex) from per),
                            'cells', coalesce(jsonb_agg(jsonb_build_array(gy, gx, good, bad)), '[]'::jsonb)),
         now()
  from cells
  on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at;
  select jsonb_array_length(d.data->'cells') into n from public.derived d where d.key = 'gnss_grid';
  return n;
end $$;
revoke all on function ingest.compute_gnss() from public, anon, authenticated;

select cron.schedule('tz-gnss', '* * * * *', 'select ingest.compute_gnss()');
select ingest.compute_gnss();
