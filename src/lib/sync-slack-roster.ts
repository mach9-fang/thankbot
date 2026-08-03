import { upsertPersonBySlackId } from "./db";
import { listSlackWorkspaceMembers } from "./slack";

export type SlackRosterSyncResult = {
  ok: boolean;
  synced: number;
  /** Why the sync could not run or came back short, for logs/diagnostics. */
  error: string | null;
};

/**
 * Pull every human Slack teammate into `people` so the web typeahead can
 * offer the full Mach9 roster — not only people who already signed in or
 * were thanked via `/thanks`.
 */
export async function syncSlackRoster(): Promise<SlackRosterSyncResult> {
  const botToken = process.env.SLACK_BOT_TOKEN ?? "";
  if (!botToken) {
    return {
      ok: false,
      synced: 0,
      error:
        "SLACK_BOT_TOKEN is not set — add it to the deployment env so the roster can sync.",
    };
  }

  const { members, error } = await listSlackWorkspaceMembers(botToken);
  for (const member of members) {
    await upsertPersonBySlackId({
      slackUserId: member.id,
      name: member.name,
      avatarUrl: member.avatar_url,
      email: member.email,
    });
  }

  if (error) {
    return {
      ok: false,
      synced: members.length,
      error: `Slack users.list failed: ${error} (check the bot token and its users:read / users:read.email scopes).`,
    };
  }

  return { ok: true, synced: members.length, error: null };
}
