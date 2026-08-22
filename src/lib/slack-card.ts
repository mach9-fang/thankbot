import { peopleBySlackIds, type ThanksSlackRef } from "./db";
import { emojifyText } from "./emoji";
import { fetchSlackCardActivity } from "./slack";
import type { PersonSummary, SlackCardActivity, SlackCardComment } from "./types";

/**
 * Load emoji and thread replies for a Slack-announced card.
 *
 * Only the thank-you card page should call this — it talks to Slack.
 */
export async function loadThanksSlackActivity(
  ref: ThanksSlackRef | null
): Promise<SlackCardActivity | null> {
  if (!ref) return null;

  const botToken = process.env.SLACK_BOT_TOKEN ?? "";
  if (!botToken) return null;

  const raw = await fetchSlackCardActivity(
    ref.channelId,
    ref.messageTs,
    botToken
  );

  if (raw.reactions.length === 0 && raw.replies.length === 0) {
    return null;
  }

  const people = await peopleBySlackIds(raw.replies.map((row) => row.slackUserId));
  const comments: SlackCardComment[] = raw.replies.map((row) => ({
    ts: row.ts,
    person: personForSlackUser(row.slackUserId, people),
    text: formatSlackReplyText(row.text, people),
    created_at: row.createdAt,
  }));

  return { reactions: raw.reactions, comments };
}

function personForSlackUser(
  slackUserId: string,
  people: Map<string, PersonSummary>
): PersonSummary {
  return (
    people.get(slackUserId) ?? {
      id: slackUserId,
      name: "Someone",
      avatar_url: null,
    }
  );
}

/** Replace Slack mention markup with names we already know. */
export function formatSlackReplyText(
  text: string,
  people: Map<string, PersonSummary>
): string {
  const withNames = text
    .replace(/<@([A-Z0-9_]+)(?:\|([^>]+))?>/g, (_match, id: string, label?: string) => {
      return people.get(id)?.name ?? label ?? "someone";
    })
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:[^>]+)>/g, "$1");

  return emojifyText(withNames);
}
