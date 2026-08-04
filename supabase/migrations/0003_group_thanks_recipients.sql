-- A thanks is one card that can recognize one or more people.
-- Safe to re-run, since hosted projects apply this by hand.
create table if not exists public.thank_recipients (
  thanks_id uuid not null references public.thanks (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  primary key (thanks_id, person_id)
);

create index if not exists thank_recipients_person_idx
  on public.thank_recipients (person_id);

-- Carry over every card written while a thanks held a single recipient.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'thanks'
      and column_name = 'to_person_id'
  ) then
    insert into public.thank_recipients (thanks_id, person_id)
    select id, to_person_id
    from public.thanks
    on conflict do nothing;
  end if;
end $$;

drop view if exists public.people_with_stats;
drop index if exists public.thanks_to_person_idx;
alter table public.thanks drop column if exists to_person_id;

create view public.people_with_stats
with (security_invoker = true) as
select
  p.*,
  (
    select count(*)
    from public.thank_recipients tr
    where tr.person_id = p.id
  )::int as thanks_received,
  (
    select count(*)
    from public.thanks t
    where t.from_person_id = p.id
  )::int as thanks_given
from public.people p;

alter table public.thank_recipients enable row level security;

drop policy if exists "thank recipients are readable" on public.thank_recipients;
create policy "thank recipients are readable"
  on public.thank_recipients for select
  using (true);

drop policy if exists "signed-in users add recipients to their thanks" on public.thank_recipients;
create policy "signed-in users add recipients to their thanks"
  on public.thank_recipients for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.thanks t
      where t.id = thanks_id
        and t.source = 'web'
        and t.from_person_id = public.current_person_id()
    )
  );

-- Both inserts run in the RPC's transaction, so a card can never be left with
-- only some of its intended recipients.
create or replace function public.create_thanks_card(
  p_from_person_id uuid,
  p_to_person_ids uuid[],
  p_reason text,
  p_source text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_thanks_id uuid;
begin
  if coalesce(cardinality(p_to_person_ids), 0) = 0 then
    raise exception 'Pick at least one teammate to thank.';
  end if;

  insert into public.thanks (from_person_id, reason, source)
  values (p_from_person_id, p_reason, p_source)
  returning id into v_thanks_id;

  insert into public.thank_recipients (thanks_id, person_id)
  select v_thanks_id, person_id
  from (
    select distinct unnest(p_to_person_ids) as person_id
  ) recipients;

  return v_thanks_id;
end;
$$;
