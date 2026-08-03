import { unstable_cache } from "next/cache";
import { syncSlackRoster } from "@/lib/sync-slack-roster";

/**
 * Sync at most once per half hour per server instance cache. Failures are
 * swallowed so a Slack outage never blanks the home page.
 */
export async function ensureSlackRosterSynced(): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) {
    return;
  }

  try {
    await unstable_cache(
      async () => {
        await syncSlackRoster();
        return true as const;
      },
      ["slack-roster-sync"],
      { revalidate: 60 * 30 }
    )();
  } catch {
    // Keep serving whoever is already in Postgres.
  }
}
