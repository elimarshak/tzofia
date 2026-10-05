# Database

Supabase project `tzofia` (ref `wpnbzpulkyogdeuuqffh`, eu-central-1).

- `0001_extensions.sql` - applied 6 Oct 2026.
- `0002_aircraft.sql` - aircraft tables and the ingest that runs inside the database. NOT applied yet.

After 0002 is applied, schedule the jobs (not applied yet):

    select cron.schedule('tz-process', '5 seconds',  $$select ingest.process()$$);
    select cron.schedule('tz-point',   '15 seconds', $$select ingest.fire('point')$$);
    select cron.schedule('tz-slow',    '* * * * *',  $$select ingest.fire('mil'); select ingest.fire('sqk7700'); select ingest.fire('sqk7600'); select ingest.fire('sqk7500')$$);
    select cron.schedule('tz-parts',   '10 3 * * *', $$select ingest.ensure_partitions()$$);

No keys or passwords belong in this repository.
