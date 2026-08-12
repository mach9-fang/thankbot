-- The board is private to the team: only signed-in visitors may read it.
-- Previously `select` was open to everyone, which meant the public anon key
-- could read every thanks without a session. Writes are unchanged, and the
-- service role (Slack, seeding) still bypasses RLS.

drop policy if exists "people are readable" on public.people;
create policy "signed-in users read people"
  on public.people for select
  to authenticated
  using (true);

drop policy if exists "thanks are readable" on public.thanks;
create policy "signed-in users read thanks"
  on public.thanks for select
  to authenticated
  using (true);
