-- Tzofia 0012: our own visit counter (asked for by Ilya on 14.10.2026; only ours, no outside service).
-- No cookie and no network address is stored. Each browser keeps a random number of its own (vid), not tied to a
-- person, so a returning visitor is not counted as new; each visit (tab open, ended by 30 minutes without activity)
-- has its own random number (sid). The site writes one line when it opens, one every minute while it stays open on
-- screen, and one for each action (a layer turned on, an item opened and so on). Country and city are worked out at
-- the moment of the visit from our own address table (tools/build_ipgeo.py); the address itself is not kept.
-- Lines from Ilya's own browsers (me = true) are kept but left out of the numbers.
create table if not exists ingest.visits (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  vid     text not null,
  sid     text not null,
  kind    text not null check (kind in ('open', 'ping', 'event')),
  name    text,                 -- for an action: e.g. layer:ships:on, item:ac, view:air, lang:en
  path    text,                 -- for an opening: the link it opened, e.g. #ac-4x1234
  ref     text,                 -- for an opening: the site the visitor came from (domain only)
  src     text,                 -- for an opening: the tag of a link Ilya published, e.g. openeye.co.il/?src=facebook
  dev     text,                 -- mobile / desktop
  os      text,                 -- android / ios / windows / mac / linux / other
  w       smallint,             -- screen width in pixels
  lang    text,                 -- he / en
  theme   text,                 -- light / dark
  country text,                 -- two letters
  city    text,                 -- for Israel
  tz      text,                 -- the browser's time zone
  me      boolean not null default false
);
create index if not exists visits_at_idx  on ingest.visits (at desc);
create index if not exists visits_vid_idx on ingest.visits (vid, at);
create index if not exists visits_sid_idx on ingest.visits (sid, at);
alter table ingest.visits enable row level security;
revoke all on ingest.visits from public, anon, authenticated;

-- 400 days are kept, so a year can be compared with the one before it
select cron.schedule('visits-trim', '17 3 * * *', $$delete from ingest.visits where at < now() - interval '400 days'$$);
