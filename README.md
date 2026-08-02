# ThankBot

An appreciation board for your team. Employees sign in with Google, thank a
teammate, and everyone sees it on the feed.

- **Next.js 14** (App Router) — deployed on Vercel
- **Supabase** — Postgres for the record of who thanked whom, plus Google auth
- **Slack** — `/thanks @person for …` is planned, not wired up yet

## How it works

1. Sign in with Google (Supabase Auth). First login creates the employee's row
   in `people`, or claims an existing row with the same email.
2. The home page form posts to `POST /api/thanks`, which sets the sender from
   the session — never from the request body.
3. The feed, leaderboard, and `/people/[id]` pages read straight from Postgres.

## Setup

### 1. Database

Run the files in `supabase/migrations/` in order in the Supabase SQL editor (or
`supabase db push`). `0001_init.sql` creates:

| Object | Purpose |
|--------|---------|
| `people` | One row per employee (`email`, `name`, `avatar_url`, optional `auth_user_id`, `slack_user_id` for later) |
| `thanks` | `from_person_id` → `to_person_id` with a `reason` and `source` |
| `people_with_stats` | View adding `thanks_received` / `thanks_given` |

Row Level Security is on: anyone can read the board, but a thanks can only be
inserted with `from_person_id` equal to the signed-in user's person row.

### 2. Google sign-in

In the Supabase dashboard → **Authentication → Providers → Google**, add your
Google OAuth client ID and secret. In the Google Cloud console, set the
authorized redirect URI to:

```
https://qewqxlzvlpgmhwibkfig.supabase.co/auth/v1/callback
```

Then under **Authentication → URL Configuration**, set the Site URL to
`https://thankbot-jol7svuvz.previewmach9.com` and add these redirect URLs:

```
https://thankbot-jol7svuvz.previewmach9.com/auth/callback
http://localhost:3000/auth/callback
```

To restrict the board to your company, limit the Google OAuth client to your
Workspace org (external users then can't complete sign-in).

### 3. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, the Vercel domain in production |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qewqxlzvlpgmhwibkfig.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Only for `pnpm seed`; keep it out of the browser |
| `NEXT_PUBLIC_ALLOW_SELF_THANKS` | Debug only — set `true` to thank yourself while testing alone |

### 4. Run it

```bash
pnpm install
pnpm seed    # optional demo people + thanks
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Import the repo in Vercel (framework preset: Next.js — no extra config).
2. Add `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` as environment variables.
3. Point the domain `thankbot-jol7svuvz.previewmach9.com` at the deployment and
   make sure the same URL is in Supabase's redirect list.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/thanks` | Recent thanks (`?limit=50`) |
| `POST` | `/api/thanks` | Send thanks — requires a session; body `{ to_person_id, reason }` |
| `GET` | `/api/people` | People with received/given counts |
| `GET` | `/api/people/[id]` | Person + received/given history |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run seed` | Load demo people + thanks (needs service role key) |
| `npm run lint` | ESLint |

## Coming later: Slack

`src/lib/slack.ts` still holds the slash-command parser and signature
verification, and `people.slack_user_id` is reserved for matching Slack accounts
to employees. The `/api/slack/thanks` endpoint will come back once the web flow
is settled.
