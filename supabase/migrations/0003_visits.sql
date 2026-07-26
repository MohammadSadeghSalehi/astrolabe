-- Unique visitors, counted without keeping anyone's address.
--
-- The IP never lands here. It is salted and hashed server-side and only the
-- digest is stored, so the table can answer "how many distinct people" without
-- being able to answer "was this person here" for any address someone hands it.
-- That is the whole reason it is a hash and not an inet column.

create table if not exists visits (
  ip_hash    text primary key,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  hits       int not null default 1
);

alter table visits enable row level security;

-- The count is public; the rows are not. A visitor sees a number, and nobody
-- gets to enumerate digests.
revoke all on public.visits from anon, authenticated;
grant all on public.visits to service_role;

create or replace function public.visit_count()
returns bigint
language sql
security definer
set search_path = public
as $$ select count(*) from visits $$;

grant execute on function public.visit_count() to anon, authenticated;
