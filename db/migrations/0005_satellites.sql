-- Our own stored copy of public source files (not readable through the public API).
create table if not exists ingest.blobs (
  key         text primary key,
  body        text not null,
  fetched_at  timestamptz not null default now()
);
alter table ingest.blobs enable row level security;

-- Every 5 minutes: ask our 'sats' function to recompute which satellites are over the map area.
select cron.schedule('tz-sats', '*/5 * * * *',
  $$select net.http_post(url := 'https://wpnbzpulkyogdeuuqffh.supabase.co/functions/v1/sats',
                         body := '{}'::jsonb, timeout_milliseconds := 60000)$$);
