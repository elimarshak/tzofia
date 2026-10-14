-- Tzofia 0012: our own count of visits to the site (asked for by Ilya on 14.10.2026).
-- No outside service and no cookie. The site sends one line when it opens and one every 5 minutes while it stays
-- open on screen. Each browser keeps a random number of its own (not tied to a person), so returning visitors can be
-- told apart from new ones. No address (IP) is stored.
create table if not exists ingest.visits (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  kind    text not null check (kind in ('open', 'ping')),
  vid     text not null,        -- the browser's random number
  path    text,                 -- what was opened, e.g. a link to an aircraft (#ac-...)
  ref     text,                 -- the site the visitor came from (domain only)
  dev     text,                 -- mobile / desktop
  lang    text,                 -- he / en
  country text,                 -- two letters, from the network's header
  city    text,
  tz      text                  -- the browser's time zone, e.g. Asia/Jerusalem (in case the network gives no country)
);
create index if not exists visits_at_idx on ingest.visits (at desc);
revoke all on ingest.visits from public, anon, authenticated;

-- a year of visits is kept
select cron.schedule('visits-trim', '17 3 * * *', $$delete from ingest.visits where at < now() - interval '365 days'$$);
