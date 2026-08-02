-- Grant the PostgREST API roles (anon / authenticated / service_role) access to
-- the public schema.
--
-- Supabase used to auto-grant these privileges on everything in the public
-- schema, but newer projects no longer grant privileges on objects created by
-- the `postgres` role. Because 0001_init.sql creates `people`, `thanks` and the
-- `people_with_stats` view without explicit grants, PostgREST returns
-- "permission denied for table ..." and the board fails to load. Re-grant the
-- privileges here so the API roles can reach the schema.
--
-- Row Level Security (configured in 0001_init.sql) remains the real security
-- boundary: anon can only read, and writes are still restricted to the
-- signed-in person by the existing policies.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
grant execute on all routines in schema public
  to anon, authenticated, service_role;

-- Make sure objects added by future migrations are reachable too.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on routines to anon, authenticated, service_role;
