-- Internet outages (Cloudflare Radar Outage Center): refresh the shared document every 15 minutes.
select cron.schedule('tz-outages', '4,19,34,49 * * * *',
  $$select net.http_post(url := 'https://wpnbzpulkyogdeuuqffh.supabase.co/functions/v1/outages', body := '{}'::jsonb, timeout_milliseconds := 60000)$$);
