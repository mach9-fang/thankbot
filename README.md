# ThankBot

An appreciation board for your team. Employees sign in with Google, thank a
teammate, and everyone sees it on the feed.

- **Next.js 14** (App Router) — deployed on Vercel
- **Supabase** — Postgres for the record of who thanked whom, plus Google auth
- **Slack** — `/thanks @person for …` (or just a reason in a 1:1 DM)

## How it works

1. Sign in with Google (Supabase Auth). First login creates the employee's row
   in `people`, or claims an existing row with the same email.
2. The home page form posts to `POST /api/thanks`, which sets the sender from
   the session — never from the request body.
3. From Slack, `/thanks @person for …` hits `POST /api/slack/thanks`, which
   upserts people by `slack_user_id` and writes a thanks with `source=slack`.
   In a 1:1 DM you can omit the mention and ThankBot thanks the other person.
4. The feed, leaderboard, and `/people/[id]` pages read straight from Postgres.

## Setup

### 1. Database

Run the files in `supabase/migrations/` in order in the Supabase SQL editor (or
`supabase db push`). `0001_init.sql` creates:

| Object | Purpose |
|--------|---------|
| `people` | One row per employee (`email`, `name`, `avatar_url`, optional `auth_user_id`, `slack_user_id`) |
| `thanks` | `from_person_id` → `to_person_id` with a `reason` and `source` |
| `people_with_stats` | View adding `thanks_received` / `thanks_given` |

Row Level Security is on: anyone can read the board, but a web thanks can only
be inserted with `from_person_id` equal to the signed-in user's person row.
Slack writes use the service role key after verifying Slack's request signature.

### 2. Google sign-in

In the Supabase dashboard → **Authentication → Providers → Google**, add your
Google OAuth client ID and secret. In the Google Cloud console, set the
authorized redirect URI to:

```
https://qewqxlzvlpgmhwibkfig.supabase.co/auth/v1/callback
```

Then under **Authentication → URL Configuration**, set the Site URL to
`https://thankbot.previewmach9.com` and add these redirect URLs:

```
https://thankbot.previewmach9.com/auth/callback
http://localhost:3000/auth/callback
```

To restrict the board to your company, limit the Google OAuth client to your
Workspace org (external users then can't complete sign-in).

### 3. Slack `/thanks`

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).
2. Under **OAuth & Permissions**, add bot scopes:
   - `commands`
   - `users:read`
   - `users:read.email` (links Slack people to Google logins by email)
   - `im:read` and `channels:read` (so a 1:1 DM can omit the `@` mention)
3. Install the app to your workspace and copy the **Bot User OAuth Token**.
4. Under **Basic Information**, copy the **Signing Secret**.
5. Under **Slash Commands**, create `/thanks` pointing at:

```
https://thankbot.previewmach9.com/api/slack/thanks
```

For local testing, tunnel your machine (e.g. `ngrok http 3000`) and use that
URL instead, or set `SLACK_SKIP_VERIFY=true` only on your laptop.

Usage in Slack:

```
/thanks @alex for reviewing my PR
/thanks for covering standup   # in a 1:1 DM — thanks the other person
```

### 4. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, the Vercel domain in production |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qewqxlzvlpgmhwibkfig.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | For `pnpm seed` and Slack writes; keep it out of the browser |
| `SLACK_SIGNING_SECRET` | Slack app → Basic Information → Signing Secret |
| `SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SKIP_VERIFY` | Local only — skips request signature checks |
| `NEXT_PUBLIC_ALLOW_SELF_THANKS` | Debug only — set `true` to thank yourself while testing alone |

### 5. Run it

```bash
pnpm install
pnpm seed    # optional demo people + thanks
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Import the repo in Vercel (framework preset: Next.js — no extra config).
2. Add `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SLACK_SIGNING_SECRET`, and `SLACK_BOT_TOKEN` as environment variables.
3. Point the domain `thankbot-jol7svuvz.previewmach9.com` at the deployment and
   make sure the same URL is in Supabase's redirect list and the Slack slash
   command Request URL.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/thanks` | Recent thanks (`?limit=50`) |
| `POST` | `/api/thanks` | Send thanks — requires a session; body `{ to_person_id, reason }` |
| `POST` | `/api/slack/thanks` | Slack slash command — verified with signing secret |
| `GET` | `/thanks/[id]` | Public thank card for a single thanks |
| `GET` | `/api/people` | People with received/given counts |
| `GET` | `/api/people/[id]` | Person + received/given history |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm seed` | Load demo people + thanks (needs service role key) |
| `pnpm lint` | ESLint |
| `pnpm tsx scripts/test-parse.ts` | Slack `/thanks` text parser assertions |
