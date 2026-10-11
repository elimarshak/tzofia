-- Phone alerts sent from the site (Web Push). Everything here is private: browsers never read these tables.
-- push_keys:   the site's own key pair for signing alerts (created by the push function on first use)
-- push_subs:   one row per phone or browser that turned alerts on, with the alert types it chose
-- push_queue:  alerts waiting to be sent
-- alert_state: when each alert condition was last true, so the same event is not sent twice
create table if not exists ingest.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
create table if not exists ingest.push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  topics text[] not null default '{}',
  lang text not null default 'he',
  created_at timestamptz not null default now(),
  last_ok timestamptz,
  fails int not null default 0
);
create table if not exists ingest.push_queue (
  id bigint generated always as identity primary key,
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_count int
);
create table if not exists ingest.alert_state (
  key text primary key,
  last_true timestamptz not null
);
alter table ingest.push_keys enable row level security;
alter table ingest.push_subs enable row level security;
alter table ingest.push_queue enable row level security;
alter table ingest.alert_state enable row level security;
