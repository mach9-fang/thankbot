import { upsertPersonBySlackId } from "./db";
import { listSlackWorkspaceMembers } from "./slack";

/**
 * Pull every human Slack teammate into `people` so the web typeahead can
 * offer the full Mach9 roster — not only people who already signed in or
 * were thanked via `/thanks`.
 */
export async function syncSlackRoster(): Promise<{
  synced: number;
  skipped: boolean;
}> {
  const botToken = process.env.SLACK_BOT_TOKEN ?? "";
  if (!botToken) {
    return { synced: 0, skipped: true };
  }

  const members = await listSlackWorkspaceMembers(botToken);
  for (const member of members) {
    await upsertPersonBySlackId({
      slackUserId: member.id,
      name: member.name,
      avatarUrl: member.avatar_url,
      email: member.email,
    });
  }

  return { synced: members.length, skipped: false };
}
