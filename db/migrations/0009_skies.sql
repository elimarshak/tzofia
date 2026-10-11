-- Emptying skies: recount the aircraft over each country in our coverage area every 10 minutes.
select cron.schedule('tz-skies', '1-59/10 * * * *',
  $$select net.http_post(url := 'https://wpnbzpulkyogdeuuqffh.supabase.co/functions/v1/skies', body := '{}'::jsonb, timeout_milliseconds := 60000)$$);
