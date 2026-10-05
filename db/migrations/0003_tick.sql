-- Tzofia: one request every 15 seconds, rotating between the sources, with a
-- one-minute pause whenever the source answers "too many requests" (HTTP 429).
create sequence if not exists ingest.tick_seq;
create or replace function ingest.tick() returns text
language plpgsql security definer set search_path = '' as $$
declare k text; i bigint;
begin
  if exists (select 1 from public.source_status s
             where s.last_error = 'HTTP 429' and s.last_try > now() - interval '60 seconds') then
    return 'backoff';
  end if;
  i := nextval('ingest.tick_seq');
  k := (array['point','mil','point','sqk7700','point','sqk7600','point','sqk7500'])[1 + (i % 8)];
  perform ingest.fire(k);
  return k;
end $$;
revoke all on function ingest.tick() from public, anon, authenticated;
