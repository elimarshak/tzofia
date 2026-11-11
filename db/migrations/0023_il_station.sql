-- The Israel station: a small program on the home server (which sits in Israel) reads two sources that answer
-- only to computers in Israel, and sends them here through public.il_ingest with its own key:
--   1. Home Front Command alerts (oref.org.il): the alert active right now, and the recent alert history.
--   2. The Geological Survey of Israel's earthquake catalogue (seis.gsi.gov.il, FDSN event service).
-- Results go to public.derived, which browsers read:
--   'oref'        -> { active, active_at, history: [{ t, title, areas, cat }], checked }
--   'quakes_gsi'  -> { hours, events: [{ id, time, lat, lon, mag, magtype, depth, region }] }
-- The key itself never reaches the database, only its SHA-256 hash.
insert into ingest.station_keys (station, key_hash)
values ('il', '5047747a497cb30d1cb9d896e68c4b9bb9e686943f772ad5ec36404a7be873f8')
on conflict do nothing;

create or replace function public.il_ingest(p_key text, p_data jsonb)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare ts timestamptz := now(); prev jsonb; hist jsonb; act jsonb;
begin
  if p_key is null or p_data is null
     or not exists (select 1 from ingest.station_keys k
                    where k.station = 'il' and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')) then
    return 'denied';
  end if;
  if pg_column_size(p_data) > 1000000 then return 'too big'; end if;
  if exists (select 1 from public.source_status s where s.source = 'il' and s.last_ok > ts - interval '1 second') then
    return 'busy';
  end if;

  -- 1. Home Front Command
  if p_data ? 'oref' then
    select data into prev from public.derived where key = 'oref';
    -- the alert active right now: title, areas (list of place names), category, description
    act := case when jsonb_typeof(p_data->'oref'->'active') = 'object' then jsonb_build_object(
             'id', left(p_data->'oref'->'active'->>'id', 40),
             'title', left(p_data->'oref'->'active'->>'title', 200),
             'cat', left(p_data->'oref'->'active'->>'cat', 10),
             'desc', left(p_data->'oref'->'active'->>'desc', 400),
             'areas', coalesce((select jsonb_agg(left(a, 80)) from (select jsonb_array_elements_text(
                        case when jsonb_typeof(p_data->'oref'->'active'->'data') = 'array' then p_data->'oref'->'active'->'data' else '[]'::jsonb end) a limit 2000) z), '[]'::jsonb))
           end;
    -- history: what was already kept (last 48 hours) plus what came now, one line per time + title + area
    with incoming as (
      select ((x->>'alertDate')::timestamp at time zone 'Asia/Jerusalem') as t,
             left(x->>'title', 200) as title, left(x->>'data', 200) as area, (x->>'category') as cat
      from jsonb_array_elements(case when jsonb_typeof(p_data->'oref'->'history') = 'array' then p_data->'oref'->'history' else '[]'::jsonb end) x
      where x->>'alertDate' ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$'
      limit 5000
    ),
    kept as (
      select (y->>'t')::timestamptz as t, y->>'title' as title, a as area, y->>'cat' as cat
      from jsonb_array_elements(coalesce(prev->'history', '[]'::jsonb)) y, jsonb_array_elements_text(y->'areas') a
    ),
    allrows as (
      select distinct t, title, area, cat from (select * from incoming union all select * from kept) u
      where t > ts - interval '48 hours'
    ),
    grouped as (
      select t, title, min(cat) as cat, jsonb_agg(area order by area) as areas
      from allrows group by t, title
    )
    select coalesce(jsonb_agg(jsonb_build_object('t', t, 'title', title, 'cat', cat, 'areas', areas) order by t desc), '[]'::jsonb)
    into hist from grouped;
    insert into public.derived (key, data, computed_at)
    values ('oref', jsonb_build_object(
              'active', act,
              'active_at', case when act is not null then
                             case when prev->'active' is not null and prev->'active'->>'id' = act->>'id' then prev->'active_at' else to_jsonb(ts) end
                           end,
              'history', hist, 'checked', ts), ts)
    on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at;
    insert into public.source_status as s (source, last_ok, last_count, last_error, last_try)
    values ('il-oref', ts, jsonb_array_length(hist), null, ts)
    on conflict (source) do update set last_ok = excluded.last_ok, last_count = excluded.last_count, last_error = null, last_try = excluded.last_try;
  end if;

  -- 2. Geological Survey of Israel: earthquakes only (the catalogue also lists quarry blasts, which are left out)
  if p_data ? 'gsi' and jsonb_typeof(p_data->'gsi'->'events') = 'array' then
    insert into public.derived (key, data, computed_at)
    select 'quakes_gsi', jsonb_build_object('hours', 48, 'events', coalesce(jsonb_agg(e order by e->>'time' desc), '[]'::jsonb)), ts
    from (
      select jsonb_build_object(
               'id', 'gsi:' || left(x->>'id', 60), 'time', x->>'time',
               'lat', (x->>'lat')::double precision, 'lon', (x->>'lon')::double precision,
               'mag', (x->>'mag')::double precision, 'magtype', left(x->>'magtype', 10),
               'depth', abs((x->>'depth')::double precision), 'region', left(x->>'region', 80)) as e
      from jsonb_array_elements(p_data->'gsi'->'events') x
      where coalesce(x->>'type', 'earthquake') = 'earthquake'
        and x->>'id' is not null and x->>'time' is not null
        and (x->>'lat') is not null and (x->>'lon') is not null and (x->>'mag') is not null
      limit 1000
    ) z
    on conflict (key) do update set data = excluded.data, computed_at = excluded.computed_at;
    insert into public.source_status as s (source, last_ok, last_count, last_error, last_try)
    values ('il-gsi', ts, jsonb_array_length(p_data->'gsi'->'events'), null, ts)
    on conflict (source) do update set last_ok = excluded.last_ok, last_count = excluded.last_count, last_error = null, last_try = excluded.last_try;
  end if;

  insert into public.source_status as s (source, last_ok, last_count, last_error, last_try)
  values ('il', ts, null, null, ts)
  on conflict (source) do update set last_ok = excluded.last_ok, last_error = null, last_try = excluded.last_try;
  return 'ok';
end $function$;

revoke all on function public.il_ingest(text, jsonb) from public;
grant execute on function public.il_ingest(text, jsonb) to anon, authenticated, service_role;
