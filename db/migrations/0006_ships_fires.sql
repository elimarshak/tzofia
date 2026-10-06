-- Latest known position of every ship heard on the AIS stream. Rows are overwritten per ship, never deleted;
-- the site shows only ships heard recently.
create table if not exists public.ships_live (
  mmsi      bigint primary key,
  name      text,
  lat       double precision,
  lon       double precision,
  sog       real,          -- speed over ground, knots
  cog       real,          -- course over ground, degrees
  heading   real,
  nav       smallint,      -- AIS navigational status code
  kind      smallint,      -- AIS ship type code
  dest      text,
  callsign  text,
  t         timestamptz    -- when we last heard a position
);
create index if not exists ships_live_t_idx on public.ships_live (t);
alter table public.ships_live enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ships_live' and policyname = 'public read') then
    create policy "public read" on public.ships_live for select to anon, authenticated using (true);
  end if;
end $$;
grant select on public.ships_live to anon, authenticated;

select cron.schedule('tz-ships', '* * * * *',
  $$select net.http_post(url := 'https://wpnbzpulkyogdeuuqffh.supabase.co/functions/v1/ships', body := '{}'::jsonb, timeout_milliseconds := 120000)$$);
select cron.schedule('tz-fires', '7,37 * * * *',
  $$select net.http_post(url := 'https://wpnbzpulkyogdeuuqffh.supabase.co/functions/v1/fires', body := '{}'::jsonb, timeout_milliseconds := 120000)$$);
