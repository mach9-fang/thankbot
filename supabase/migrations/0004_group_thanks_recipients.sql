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
--
-- Thanking several people used to write one row each, so a single command left
-- the board showing the same message several times over. Those rows are folded
-- back into one card: same sender, same wording, same source, written close
-- enough together to have come from one command (each recipient cost a couple
-- of Slack lookups, so allow a few minutes between them).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'thanks'
      and column_name = 'to_person_id'
  ) then
    execute $migrate$
      with ordered as (
        select
          t.id,
          t.to_person_id,
          t.from_person_id,
          t.reason,
          t.source,
          t.created_at,
          lag(t.created_at) over (
            partition by t.from_person_id, t.reason, t.source
            order by t.created_at, t.id
          ) as previous_created_at
        from public.thanks t
      ),
      batched as (
        select
          ordered.*,
          count(*) filter (
            where previous_created_at is null
              or created_at - previous_created_at > interval '5 minutes'
          ) over (
            partition by from_person_id, reason, source
            order by created_at, id
            rows between unbounded preceding and current row
          ) as batch
        from ordered
      ),
      grouped as (
        select
          id,
          to_person_id,
          first_value(id) over (
            partition by from_person_id, reason, source, batch
            order by created_at, id
          ) as card_id
        from batched
      ),
      carried as (
        insert into public.thank_recipients (thanks_id, person_id)
        select card_id, to_person_id
        from grouped
        on conflict do nothing
        returning 1
      )
      delete from public.thanks t
      using grouped g
      where t.id = g.id
        and g.id <> g.card_id
    $migrate$;
  end if;
end $$;

-- Replace the view *before* dropping to_person_id so we never DROP VIEW
-- (which discards PostgREST grants and blanks the board).
create or replace view public.people_with_stats
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

drop index if exists public.thanks_to_person_idx;
alter table public.thanks drop column if exists to_person_id;

alter table public.thank_recipients enable row level security;

-- Same privacy as people/thanks: the board is for signed-in visitors. Slack
-- posting does not use these policies; it goes through the service-role RPC.
drop policy if exists "thank recipients are readable" on public.thank_recipients;
drop policy if exists "signed-in users read thank recipients" on public.thank_recipients;
create policy "signed-in users read thank recipients"
  on public.thank_recipients for select
  to authenticated
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
--
-- SECURITY DEFINER is the Slack hole: /thanks has no Google session, so it
-- cannot satisfy the authenticated insert policies. The website still requires
-- a signed-in user (source=web). Slack and seed must present the service role.
create or replace function public.create_thanks_card(
  p_from_person_id uuid,
  p_to_person_ids uuid[],
  p_reason text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thanks_id uuid;
  v_role text := coalesce(auth.role(), '');
begin
  if coalesce(cardinality(p_to_person_ids), 0) = 0 then
    raise exception 'Pick at least one teammate to thank.';
  end if;

  if p_source = 'web' then
    if v_role is distinct from 'authenticated'
       or p_from_person_id is distinct from public.current_person_id() then
      raise exception 'Sign in with Google to say thanks.';
    end if;
  elsif p_source in ('slack', 'seed') then
    if v_role is distinct from 'service_role' then
      raise exception 'Slack thanks must be recorded with the service role.';
    end if;
  else
    raise exception 'Unknown thanks source.';
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

-- Hosted Supabase no longer auto-exposes new public objects to the Data API
-- roles. Without EXECUTE, PostgREST omits this RPC from its schema cache and
-- writes fail with PGRST202. Grant it only to the roles that may call it:
-- signed-in website users, and the service role Slack/seed use.
grant all on table public.thank_recipients to anon, authenticated, service_role;
grant select on public.people_with_stats to anon, authenticated, service_role;
revoke all on function public.create_thanks_card(uuid, uuid[], text, text)
  from public, anon;
grant execute on function public.create_thanks_card(uuid, uuid[], text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
