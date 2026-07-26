-- Hackathon sign-ups and uploaded recordings.
--
-- Deliberately minimal. This is a demonstration built during a hackathon and the
-- sign-up page says so: the data may be deleted after the event, the product
-- makes no clinical claim, and consent is an explicit action rather than an
-- assumed one. Storing less is the whole design — there is no name, no date of
-- birth, no address, and nothing that would make this a health record.

create table if not exists signups (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  -- What they said they are, in their own words. Free text on purpose: a fixed
  -- taxonomy of "patient / carer / clinician" would make people pick a box that
  -- is wrong for them, and we are asking to learn, not to segment.
  role          text,
  note          text,
  -- Consent is recorded as the version of the terms that was on screen when the
  -- box was ticked, not as a bare boolean. A boolean cannot tell you what was
  -- agreed to once the wording changes.
  terms_version text not null,
  accepted_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists signups_created_at_idx on signups (created_at desc);

alter table signups enable row level security;

-- No public read. A list of people who told us they have Parkinson's is not
-- something an anonymous key should be able to enumerate, however short the
-- event is. Inserts go through a server route holding the service role.
revoke all on public.signups from anon, authenticated;
grant all on public.signups to service_role;
