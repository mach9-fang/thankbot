# AGENTS.md

## Cursor Cloud specific instructions

ThankBot is a single **Next.js 14** app (App Router) backed by **Supabase**
(Postgres + Auth). Standard scripts live in `package.json` and are documented in
`README.md` (`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm seed`). Only the
non-obvious, durable notes are captured here.

### Backend: local Supabase (Docker)

The app cannot render without a Supabase backend (the home page reads `thanks`
and `people` on the server). For local development this repo uses a **local
Supabase stack** driven by the Supabase CLI + Docker instead of the hosted
project referenced in the README. Docker and the Supabase CLI are preinstalled
in the VM image, but neither the Docker daemon nor the Supabase containers start
automatically. On a fresh session:

1. Start the Docker daemon (it is not running on boot):
   `sudo dockerd > /tmp/dockerd.log 2>&1 &` (leave it running; it uses the
   `fuse-overlayfs` storage driver — do not change `/etc/docker/daemon.json`).
2. From the repo root, `supabase start` (first run pulls images; later runs are
   fast). This applies `supabase/migrations/*` and then runs `supabase/seed.sql`.
3. Create `.env.local` (git-ignored) — see values below.
4. `pnpm seed` to load demo people/thanks (optional but recommended).
5. `pnpm dev` and open http://localhost:3000.

Get local URLs/keys anytime with `supabase status`. The local demo keys are
stable across machines (safe to hardcode in `.env.local`):

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY from `supabase status` (sb_publishable_…)>
SUPABASE_SERVICE_ROLE_KEY=<SECRET_KEY from `supabase status` (sb_secret_…)>
NEXT_PUBLIC_ALLOW_SELF_THANKS=true
```

Use the **new-style** keys — `PUBLISHABLE_KEY` (`sb_publishable_…`) as the anon
key and `SECRET_KEY` (`sb_secret_…`) as the service role key, both from
`supabase status`. The legacy JWT `anon`/`service_role` keys printed by
`supabase status` are silently downgraded to the `anon` role by the local stack
and cause "permission denied". (The local keys are stable demo values, but are
left out of source control here to satisfy secret scanning.)

### Gotcha: table grants (`supabase/seed.sql`)

The hosted Supabase platform auto-grants table privileges to the PostgREST API
roles (`anon`/`authenticated`/`service_role`). The **local** stack does NOT do
this for tables created by `postgres` in the `public` schema, so PostgREST
returns `permission denied for table people/thanks`. `supabase/seed.sql`
re-applies those grants and is run automatically after migrations by
`supabase start` and `supabase db reset`. If you bypass the seed step (or apply
migrations by hand), run `supabase/seed.sql` against the DB or you will hit
permission-denied errors. RLS (configured in the migrations) remains the real
security boundary.

### Auth for local testing

The UI only offers "Sign in with Google", which can't be completed locally. To
exercise the authenticated flow (sending a thanks), create a user directly in
local GoTrue and use its session — e.g. `POST /auth/v1/admin/users` with the
service key and `email_confirm: true` (this mirrors the `auth.users` row a
Google login would create), then `POST /auth/v1/token?grant_type=password` to
get a session. `getCurrentPerson()` auto-creates/claims the matching `people`
row on the first authenticated request. `NEXT_PUBLIC_ALLOW_SELF_THANKS=true`
lets a single user thank themselves.

### Misc

- `scripts/test-parse.ts` is a standalone assertion script (no test runner):
  run it with `pnpm tsx scripts/test-parse.ts`.
- Reinstalling deps or restarting Supabase does not require restarting `pnpm dev`
  for schema changes, but env-var changes in `.env.local` require a dev restart.
