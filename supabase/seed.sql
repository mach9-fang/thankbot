-- Local-only bootstrap, run automatically after migrations by
-- `supabase start` / `supabase db reset`.
--
-- The hosted Supabase project this app targets auto-grants table privileges to
-- the PostgREST API roles (anon / authenticated / service_role). The local
-- Supabase stack does NOT do this for objects created by `postgres` in the
-- public schema, so without these grants PostgREST returns
-- "permission denied for table ...". Row Level Security (configured in the
-- migrations) remains the real security boundary; these grants only mirror the
-- hosted platform's default privileges so local development behaves the same.
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
