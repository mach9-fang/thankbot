-- 0004 dropped and recreated people_with_stats, which throws away table/view
-- grants. Hosted Supabase also no longer auto-exposes new public objects.
-- Without these grants PostgREST omits thank_recipients, the stats view, and
-- create_thanks_card from its schema cache — the board cannot render and
-- Slack /thanks cannot record a card. Safe to re-run.

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

grant all on table public.people to anon, authenticated, service_role;
grant all on table public.thanks to anon, authenticated, service_role;
grant all on table public.thank_recipients to anon, authenticated, service_role;
grant select on public.people_with_stats to anon, authenticated, service_role;

revoke all on function public.create_thanks_card(uuid, uuid[], text, text)
  from public, anon;
grant execute on function public.create_thanks_card(uuid, uuid[], text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
