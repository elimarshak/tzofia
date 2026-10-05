# Database

Supabase project `tzofia` (ref `wpnbzpulkyogdeuuqffh`, eu-central-1). All three
migrations were applied on 6 Oct 2026 through the Supabase SQL editor.

- `0001_extensions.sql` - pg_net, pg_cron.
- `0002_aircraft.sql` - aircraft tables and the ingest that runs inside the database.
- `0003_tick.sql` - request rotation and back-off.

Scheduled jobs (pg_cron):

    select cron.schedule('tz-process', '5 seconds',  $$select ingest.process()$$);
    select cron.schedule('tz-tick',    '15 seconds', $$select ingest.tick()$$);
    select cron.schedule('tz-parts',   '10 3 * * *', $$select ingest.ensure_partitions()$$);

Known limits, 6 Oct 2026:
- adsb.lol answers HTTP 429 to part of the requests coming from the database's
  shared outgoing address. Effective refresh of the Israel circle is about once
  a minute. A server with its own address, or our own receiver, removes this.
- `cron.job_run_details` grows by about 23,000 rows a day and needs a cleanup job.
- No retention job yet for `aircraft_positions` (decision: keep six months).

No keys or passwords belong in this repository.
