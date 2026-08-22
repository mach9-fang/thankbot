-- Remember which Slack message announced a card so the card page can load
-- that message's emoji and thread replies. Null for web/seed cards, and for
-- Slack thanks posted through response_url when ThankBot is not in the room.
-- Safe to re-run.

alter table public.thanks
  add column if not exists slack_channel_id text,
  add column if not exists slack_message_ts text;

create unique index if not exists thanks_slack_message_idx
  on public.thanks (slack_channel_id, slack_message_ts)
  where slack_channel_id is not null and slack_message_ts is not null;

notify pgrst, 'reload schema';
