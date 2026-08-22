# ThankBot

An appreciation board for your team. Employees sign in with Google, thank a
teammate, and everyone sees it on the feed.

- **Next.js 14** (App Router) — deployed on Vercel
- **Supabase** — Postgres for the record of who thanked whom, plus Google auth
- **Slack** — `/thanks @person for …`, multiple `@mentions`, `everyone` in a
  channel, or just a reason where one teammate is obvious

## How it works

1. Sign in with Google (Supabase Auth). First login creates the employee's row
   in `people`, or claims an existing row with the same email.
2. The home page form posts to `POST /api/thanks`, which sets the sender from
   the session — never from the request body.
3. From Slack, `/thanks @alice @bob for …` hits `POST /api/slack/thanks`, which
   upserts people by `slack_user_id` and writes one card shared by all recipients
   with `source=slack`. When ThankBot is in the conversation it announces the
   card with `chat.postMessage` and stores that message's channel and timestamp
   so the thank-you card page can load Slack emoji and thread replies (the feed
   does not call Slack). If the bot cannot post, it falls back to the slash
   command's `response_url` and then tries to find that announcement in
   history. Cards posted before this is deployed have no Slack identity, so
   their emoji will not appear until you send a new `/thanks`. Slack keeps
   calling whichever deployment the slash command Request URL points at.
   List people however
   you'd write them — `@alice, @bob`, `@alice, @bob, and @carol`, `@alice; @bob`,
   `@alice & @bob` — the separators belong to the list, not to the reason. You
   can thank a whole channel with `/thanks everyone for …`, and omit the mention
   wherever ThankBot can see exactly one other person — including a 1:1 DM with
   a teammate once `SLACK_USER_TOKEN` is set (see below). Mentions that aren't
   in the conversation (or don't exist) are skipped and reported back.
4. On the web, the form's typeahead takes several teammates: pick them from the
   list, or type (or paste) names separated by commas, semicolons or "and". One
   send is one card, whoever it names. The feed, leaderboard, and `/people/[id]`
   pages read from Postgres.

## Setup

### 1. Database

Run the files in `supabase/migrations/` in order in the Supabase SQL editor (or
`supabase db push`). Together they create:

| Object | Purpose |
|--------|---------|
| `people` | One row per employee (`email`, `name`, `avatar_url`, optional `auth_user_id`, `slack_user_id`) |
| `thanks` | One card with a sender, `reason`, `source`, and optional Slack message identity |
| `thank_recipients` | The people recognized by each card |
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
   - `chat:write` (announce the card as ThankBot so the card page can find it)
   - `reactions:read` (emoji on that announcement, loaded when someone opens the card)
   - `channels:history`, `groups:history`, `im:history`, and `mpim:history`
     (thread replies on the card page)
   - `users:read`
   - `users:read.email` (links Slack people to Google logins by email)
   - `channels:read`, `groups:read`, `im:read`, and `mpim:read` (conversation
     rosters, so a lone teammate can be thanked without a mention)

   Invite ThankBot to each channel where `/thanks` should collect Slack emoji
   and comments. **Reinstall the app after adding scopes** — Slack keeps
   honouring the token it already issued, so `/thanks` carries on working while
   emoji and replies stay invisible. `GET /api/health` lists the scopes an
   install is still missing.
3. To omit the mention in a **1:1 DM with a teammate**, also add the *user*
   scope `im:read` under **User Token Scopes**. Slack never lets a bot token see
   a DM it isn't in, so ThankBot reads that roster with the token of the person
   who granted it, and only for that person's own commands.
4. Install the app to your workspace and copy the **Bot User OAuth Token** (and
   the **User OAuth Token** if you added the user scope).
5. Under **Basic Information**, copy the **Signing Secret**.
6. Under **Slash Commands**, create `/thanks` pointing at:

```
https://thankbot.previewmach9.com/api/slack/thanks
```

For local testing, tunnel your machine (e.g. `ngrok http 3000`) and use that
URL instead, or set `SLACK_SKIP_VERIFY=true` only on your laptop.

Usage in Slack:

```
/thanks @alex for reviewing my PR
/thanks @alice @bob for shipping the release
/thanks everyone for covering on-call   # also: all, everybody, every body
/thanks for covering standup            # where ThankBot sees one other person
```

The last form needs a single obvious recipient. It works in a 1:1 DM with a
teammate (with `SLACK_USER_TOKEN`), and in any channel or group DM where
ThankBot is a member and exactly one other person is present. A 1:1 DM with
ThankBot itself has nobody to thank, so it asks for a mention.

A recorded thanks posts in-channel: Slack `@mention`s each receiver, a
**View card** link, and a 1-second GIF of the thank-you card with confetti
(`/thanks/<id>/card.gif`, public so Slack can fetch it).

#### When a card shows no Slack emoji or replies

Reading emoji and replies takes more than a deploy: `reactions:read` and the
four `*:history` scopes arrived with this feature, and Slack ignores a scope
until the app is **reinstalled**. `thanks.slack_channel_id` arrived with it too,
and migrations are applied by hand. Either one missing looks exactly like a
thread nobody has reacted to.

Rather than guess, the card page names the reason it found — a missing scope
(with the scope Slack asked for), a channel ThankBot has been removed from, a
card that was never announced, or an outstanding migration. `GET /api/health`
answers the same question for the whole deployment, before anyone opens a card:

```json
{ "ok": false, "pendingMigrations": [],
  "slack": { "ok": false, "configured": true,
             "missingScopes": ["reactions:read", "channels:history"] } }
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
| `SLACK_USER_TOKEN` | Optional — User OAuth Token (`im:read` user scope) so its owner can skip the mention in their own 1:1 DMs |
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
   Add `SLACK_USER_TOKEN` too if `/thanks <reason>` should work in 1:1 DMs.
3. Point the domain `thankbot-jol7svuvz.previewmach9.com` at the deployment and
   make sure the same URL is in Supabase's redirect list and the Slack slash
   command Request URL.
4. Apply any new files in `supabase/migrations/` to the hosted project as part
   of the same release (`pnpm db:push`, or paste them into the SQL editor).
   Nothing in CI does this for you. The app degrades rather than breaking when a
   migration is outstanding — a thanks sent before
   `0004_group_thanks_recipients.sql` is applied is still recorded, but as one
   row per recipient instead of one shared card.
5. Reinstall the Slack app if the release added a bot scope. Scopes added in
   the app config do nothing until the install is redone, and the app keeps
   working with its old ones, so nothing fails loudly.
6. Check `GET /api/health` after the deploy. It needs no session and answers
   `503` with the migrations still to apply and the bot scopes still to grant:

   ```json
   { "ok": false, "shape": "legacy",
     "pendingMigrations": ["0004_group_thanks_recipients.sql"],
     "slack": { "ok": false, "configured": true,
                "missingScopes": ["reactions:read"] } }
   ```

   Point an uptime monitor at it and a schema or a Slack install that has
   fallen behind the code raises an alarm instead of waiting to be found by
   somebody saying thanks.

Slack keeps talking to whichever deployment its slash command Request URL points
at, so a change to `/thanks` only shows up in Slack once that deployment is the
one carrying it.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/thanks` | Recent thanks (`?limit=50`) |
| `POST` | `/api/thanks` | Send thanks — requires a session; body `{ to_person_ids, reason }` (or legacy `to_person_id`) |
| `POST` | `/api/slack/thanks` | Slack slash command — verified with signing secret |
| `GET` | `/api/health` | Deploy check — no session needed; `503` while a migration is outstanding |
| `GET` | `/thanks/[id]` | Card page for one thanks (signed-in) |
| `GET` | `/thanks/[id]/card.gif` | 1-second thank-you card GIF with confetti (public; Slack embed) |
| `GET` | `/api/people` | People with received/given counts |
| `GET` | `/api/people/[id]` | Person + received/given history |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm seed` | Load demo people + thanks (needs service role key) |
| `pnpm db:push` | Apply `supabase/migrations/` to the linked hosted project |
| `pnpm lint` | ESLint |
| `pnpm tsx scripts/test-parse.ts` | Slack `/thanks` text parser assertions |
| `pnpm tsx scripts/test-slack-card-gif.ts` | Slack mention reply + 1-second card GIF |
| `pnpm tsx scripts/test-slack-recipients.ts` | Recipient resolution for `/thanks` without a mention |
| `pnpm tsx scripts/test-slack-card-activity.ts` | Slack announcement identity, emoji, and thread replies on the card |
| `pnpm tsx scripts/test-recipient-list.ts` | Reading a typed or pasted list of names on the web form |
| `pnpm tsx scripts/test-time-range.ts` | Which month or week the board's period picker means |
| `pnpm tsx scripts/test-thanks-write-paths.ts` | Web + Slack writes against whichever schema is live (needs local Supabase + `.env.local`) |
| `pnpm tsx scripts/test-schema-health.ts` | `/api/health` reports the live schema honestly (needs local Supabase + `.env.local`) |
| `pnpm tsx scripts/test-slack-dm-flow.ts` | Slack DM flow end to end (needs local Supabase + `.env.local`) |
| `pnpm tsx scripts/test-slack-multi-recipient.ts` | Thanking several people at once end to end (needs local Supabase + `.env.local`) |
