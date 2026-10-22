-- Tzofia 0015: one request to adsb.lol every 3 minutes, 480 a day, under its limit of 500 a day (Ilya, 22.10.2026).
-- After 0014 we still sent about 5,400 requests a day and were blocked again and again.
-- The single request is the big circle of 2,160 nm (about 4,000 km) around 32.0N 34.9E. It keeps the name 'point',
-- so the history of the region, the "emptying skies" check and the freshness line keep working as they are.
-- The worldwide lists (military aircraft, emergencies 7700/7600/7500) are no longer asked for: an emergency
-- within about 4,000 km still arrives with the big circle. Aircraft near home keep coming every second from
-- our own receiver.
-- No delete statements here, so the change can be applied directly.

create or replace function ingest.fire(p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare u text; id bigint;
begin
  u := case p_kind
    when 'point'   then 'https://api.adsb.lol/v2/point/32.0/34.9/2160'
  end;
  if u is null then raise exception 'unknown kind %', p_kind; end if;
  -- never stack requests
  if exists (select 1 from ingest.requests r where r.kind = p_kind and r.sent_at > now() - interval '2 minutes') then
    return;
  end if;
  id := net.http_get(url := u, timeout_milliseconds := 20000,
                     headers := '{"User-Agent":"tzofia/0.1 (+https://github.com/elimarshak/tzofia)"}'::jsonb);
  insert into ingest.requests (req_id, kind) values (id, p_kind);
  insert into public.source_status (source, last_try) values ('adsb.lol/' || p_kind, now())
    on conflict (source) do update set last_try = excluded.last_try;
end $$;
revoke all on function ingest.fire(text) from public, anon, authenticated;

create or replace function ingest.tick() returns text
language plpgsql security definer set search_path = '' as $$
declare i bigint;
begin
  -- the source asked us to slow down: stay away until the wait is over
  if exists (select 1 from ingest.backoff b where b.until > now()) then
    return 'backoff';
  end if;
  i := nextval('ingest.tick_seq');
  -- the tick runs every 15 seconds: 12 ticks = 3 minutes, one request in each
  if i % 12 <> 0 then return 'rest'; end if;
  -- a far aircraft leaves the map only after it missed two big circles
  update public.aircraft_live set in_wide = false
    where in_wide and updated_at < now() - interval '7 minutes';
  perform ingest.fire('point');
  return 'point';
end $$;
revoke all on function ingest.tick() from public, anon, authenticated;
