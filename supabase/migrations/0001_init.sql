-- Astrolabe initial schema (Track C — Supabase)
-- Participants, reconstruction bundles (jsonb), and diary/voice events.
-- RLS: public read for demo; insert events only when authenticated.

create table participants (
  id            text primary key,          -- 'COPS-29'
  age           int,
  sex           text,
  pd_subtype    text,
  hoehn_yahr    numeric,
  dbs           boolean,
  created_at    timestamptz default now()
);

create table bundles (
  participant   text references participants(id),
  day           int,
  variant       text not null default 'full',   -- 'full' | 'nowrist'
  payload       jsonb not null,
  metrics       jsonb generated always as (payload->'metrics') stored,
  created_at    timestamptz default now(),
  primary key (participant, day, variant)
);

create table events (
  id            uuid primary key default gen_random_uuid(),
  participant   text references participants(id),
  day           int,
  t             text not null,
  type          text not null,
  source        text not null default 'reported',
  drug          text,
  dose_mg       numeric,
  note          text,
  created_at    timestamptz default now()
);

alter table participants enable row level security;
alter table bundles      enable row level security;
alter table events       enable row level security;

create policy "read bundles"      on bundles      for select using (true);
create policy "read participants" on participants for select using (true);
create policy "read events"       on events       for select using (true);
create policy "insert own events" on events       for insert
  with check (auth.uid() is not null);

-- Realtime for voice-track event inserts (subscribeEvents helper).
-- Enable replication on events in the dashboard, or:
-- alter publication supabase_realtime add table events;
