# ThankBot

A small appreciation board for your team.

- **Web UI** — see who thanked whom, plus each person's thanks history
- **Slack** — `/thanks @person for <reason>` creates an entry automatically

## Features

1. **Home feed** — latest thanks and a “most thanked” leaderboard
2. **Person pages** — `/people/[id]` shows thanks received and given
3. **Slack slash command** — `POST /api/slack/thanks` handles `/thanks`

## Quick start

```bash
npm install
cp .env.example .env.local
npm run seed    # optional demo data
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Slack setup

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).
2. Under **OAuth & Permissions**, add bot scopes:
   - `commands`
   - `users:read` (to resolve display names / avatars)
3. Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-…`).
4. Under **Basic Information**, copy the **Signing Secret**.
5. Under **Slash Commands**, create `/thanks`:
   - **Request URL**: `https://<your-host>/api/slack/thanks`
   - **Short description**: Thank a teammate
   - **Usage hint**: `@person [ @person2 … ] for <reason>`
6. Put the values in `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=https://your-thankbot.example.com
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=xoxb-...
```

### Usage in Slack

```
/thanks @alice for reviewing my PR
/thanks @bob @cara for crushing the launch
```

ThankBot:

- Parses Slack user mentions (`<@U123…>`)
- Upserts people in SQLite
- Creates one thanks entry per recipient
- Replies in-channel with a confirmation

For local development without signature checks, set `SLACK_SKIP_VERIFY=true` (never in production).

You can also test the endpoint with curl:

```bash
curl -X POST http://localhost:3000/api/slack/thanks \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'user_id=U_TEST&user_name=tester&command=/thanks&text=<@U_ALICE> for being awesome'
```

(Requires `SLACK_SKIP_VERIFY=true` and a seeded/known recipient id, or the recipient will be stored with their Slack id as the name until `users.info` succeeds.)

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/thanks` | Recent thanks (`?limit=50`) |
| `GET` | `/api/people` | People with received/given counts |
| `GET` | `/api/people/[id]` | Person + received/given history |
| `POST` | `/api/slack/thanks` | Slack slash command webhook |

## Stack

- Next.js 14 (App Router)
- Tailwind CSS
- SQLite via `better-sqlite3` (file at `data/thankbot.db`)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run seed` | Load demo people + thanks |
| `npm run lint` | ESLint |
