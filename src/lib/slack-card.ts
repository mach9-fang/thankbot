import {
  attachSlackMessage,
  peopleBySlackIds,
  type ThanksSlackRefResult,
} from "./db";
import { emojifyText } from "./emoji";
import {
  fetchSlackCardActivity,
  findSlackAnnouncement,
  type SlackApiProblem,
} from "./slack";
import type { PersonSummary, SlackCardActivity, SlackCardComment } from "./types";

/** Adds `thanks.slack_channel_id` / `slack_message_ts`. */
export const SLACK_IDENTITY_MIGRATION = "0006_slack_message_identity.sql";

/** Why a Slack card shows no emoji or replies, when it is not just quiet. */
export type SlackCardBlocker =
  | { kind: "schema_pending"; migration: string }
  | { kind: "no_token" }
  | { kind: "not_announced" }
  | { kind: "missing_scope"; scopes: string[] }
  | { kind: "unreadable"; error: string };

/**
 * What the card page should show under a thanks.
 *
 * `quiet` means ThankBot read the message and nobody has reacted yet;
 * `blocked` means it could not read the message at all. Those looked
 * identical before, which is why a workspace full of emoji could show an
 * empty card with no way to tell what was wrong.
 */
export type SlackCardState =
  | { status: "quiet" }
  | {
      status: "activity";
      activity: SlackCardActivity;
      /** Set when one half loaded and the other was refused. */
      blocker: SlackCardBlocker | null;
    }
  | { status: "blocked"; blocker: SlackCardBlocker };

/**
 * Load emoji and thread replies for a Slack-announced card.
 *
 * Only the thank-you card page should call this — it talks to Slack.
 */
export async function loadThanksSlackActivity(
  thanksId: string,
  ref: ThanksSlackRefResult
): Promise<SlackCardState> {
  if (ref.status === "schema_pending") {
    return blocked({
      kind: "schema_pending",
      migration: SLACK_IDENTITY_MIGRATION,
    });
  }
  if (ref.status === "not_announced") {
    return blocked({ kind: "not_announced" });
  }

  const botToken = process.env.SLACK_BOT_TOKEN ?? "";
  if (!botToken) {
    return blocked({ kind: "no_token" });
  }

  const { channelId } = ref.ref;
  let messageTs = ref.ref.messageTs;
  if (!messageTs) {
    messageTs = await findSlackAnnouncement(channelId, thanksId, botToken);
    if (messageTs) {
      await attachSlackMessage(thanksId, channelId, messageTs);
    }
  }
  if (!messageTs) {
    return blocked({ kind: "not_announced" });
  }

  const raw = await fetchSlackCardActivity(channelId, messageTs, botToken);
  const blocker = blockerForProblems(raw.problems);

  if (raw.reactions.length === 0 && raw.replies.length === 0) {
    return blocker ? blocked(blocker) : { status: "quiet" };
  }

  const people = await peopleBySlackIds(raw.replies.map((row) => row.slackUserId));
  const comments: SlackCardComment[] = raw.replies.map((row) => ({
    ts: row.ts,
    person: personForSlackUser(row.slackUserId, people),
    text: formatSlackReplyText(row.text, people),
    created_at: row.createdAt,
  }));

  return {
    status: "activity",
    activity: { reactions: raw.reactions, comments },
    blocker,
  };
}

function blocked(blocker: SlackCardBlocker): SlackCardState {
  return { status: "blocked", blocker };
}

/** Missing scopes are the fixable case, so they win over anything else. */
function blockerForProblems(
  problems: SlackApiProblem[]
): SlackCardBlocker | null {
  if (problems.length === 0) return null;

  const scopes = Array.from(
    new Set(
      problems
        .filter((problem) => problem.error === "missing_scope")
        .flatMap((problem) => (problem.needed ?? "").split(","))
        .map((scope) => scope.trim())
        .filter(Boolean)
    )
  );
  if (scopes.length > 0) {
    return { kind: "missing_scope", scopes };
  }

  return { kind: "unreadable", error: problems[0].error };
}

/** One sentence a reader can act on, instead of a shrug. */
export function describeSlackCardBlocker(blocker: SlackCardBlocker): string {
  switch (blocker.kind) {
    case "schema_pending":
      return `Slack emoji and thread replies need the ${blocker.migration} migration, which this database has not run yet.`;
    case "no_token":
      return "This deployment has no SLACK_BOT_TOKEN, so ThankBot cannot read its announcement.";
    case "not_announced":
      return "ThankBot never posted this card in Slack, so there is no message to read. Invite ThankBot to the channel and send a new /thanks.";
    case "missing_scope": {
      const plural = blocker.scopes.length > 1;
      return `ThankBot's Slack app is missing the ${formatScopeList(
        blocker.scopes
      )} scope${plural ? "s" : ""}. Add ${
        plural ? "them" : "it"
      } under OAuth & Permissions, then reinstall the app to the workspace.`;
    }
    case "unreadable":
      return describeSlackError(blocker.error);
  }
}

function describeSlackError(error: string): string {
  switch (error) {
    case "not_in_channel":
    case "channel_not_found":
      return "ThankBot is no longer in the Slack conversation that announced this card, so it cannot read the emoji or replies.";
    case "message_not_found":
      return "ThankBot could not find its announcement in Slack — the message may have been deleted.";
    case "request_failed":
      return "ThankBot could not reach Slack to load the emoji and replies. Try again in a moment.";
    default:
      return `Slack would not show this message's emoji and replies (${error}).`;
  }
}

function formatScopeList(scopes: string[]): string {
  if (scopes.length <= 1) return scopes.join("");
  if (scopes.length === 2) return `${scopes[0]} and ${scopes[1]}`;
  return `${scopes.slice(0, -1).join(", ")}, and ${scopes[scopes.length - 1]}`;
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
