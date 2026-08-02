-- ThankBot schema: people (employees) + thanks (the record of who thanked whom).
-- Run this in the Supabase SQL editor, or via `supabase db push`.

create extension if not exists "pgcrypto";

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  -- Set when the person has signed in with Google. Null for people who only
  -- exist because someone thanked them (or, later, Slack-only teammates).
  auth_user_id uuid unique references auth.users (id) on delete set null,
  email text unique,
  name text not null,
  avatar_url text,
  slack_user_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.thanks (
  id uuid primary key default gen_random_uuid(),
  from_person_id uuid not null references public.people (id) on delete cascade,
  to_person_id uuid not null references public.people (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  source text not null default 'web' check (source in ('web', 'slack', 'seed')),
  created_at timestamptz not null default now()
);

create index if not exists thanks_to_person_idx on public.thanks (to_person_id);
create index if not exists thanks_from_person_idx on public.thanks (from_person_id);
create index if not exists thanks_created_at_idx on public.thanks (created_at desc);

-- Received/given counts for the leaderboard and person pages.
create or replace view public.people_with_stats
with (security_invoker = true) as
select
  p.*,
  (select count(*) from public.thanks t where t.to_person_id = p.id)::int
    as thanks_received,
  (select count(*) from public.thanks t where t.from_person_id = p.id)::int
    as thanks_given
from public.people p;

-- The people row belonging to the caller, used by the insert policy below.
create or replace function public.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.people where auth_user_id = auth.uid();
$$;

alter table public.people enable row level security;
alter table public.thanks enable row level security;

-- The board is readable by anyone; writes are locked to the signed-in person.
drop policy if exists "people are readable" on public.people;
create policy "people are readable"
  on public.people for select
  using (true);

drop policy if exists "signed-in users create their own person row" on public.people;
create policy "signed-in users create their own person row"
  on public.people for insert
  to authenticated
  with check (auth_user_id = auth.uid());

drop policy if exists "signed-in users update their own person row" on public.people;
create policy "signed-in users update their own person row"
  on public.people for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- A person can already exist without a login (seeded, or later a Slack-only
-- teammate). Signing in with the matching email claims that row instead of
-- creating a duplicate.
drop policy if exists "signed-in users claim their unlinked person row" on public.people;
create policy "signed-in users claim their unlinked person row"
  on public.people for update
  to authenticated
  using (
    auth_user_id is null
    and email is not null
    and email = (auth.jwt() ->> 'email')
  )
  with check (auth_user_id = auth.uid());

drop policy if exists "thanks are readable" on public.thanks;
create policy "thanks are readable"
  on public.thanks for select
  using (true);

drop policy if exists "signed-in users send thanks as themselves" on public.thanks;
create policy "signed-in users send thanks as themselves"
  on public.thanks for insert
  to authenticated
  with check (
    source = 'web'
    and from_person_id = public.current_person_id()
  );
