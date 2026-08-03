import { unstable_cache } from "next/cache";
import { syncSlackRoster } from "./sync-slack-roster";

/**
 * Refresh the Slack roster at most once per half hour. Only successful syncs
 * are cached — a missing token or Slack error is logged and retried on the
 * next request instead of being silently remembered for 30 minutes.
 */
export async function ensureSlackRosterSynced(): Promise<void> {
  try {
    await unstable_cache(
      async () => {
        const result = await syncSlackRoster();
        if (!result.ok) {
          // Throw so unstable_cache does not memoize the failure.
          throw new Error(result.error ?? "slack roster sync failed");
        }
        return result.synced;
      },
      ["slack-roster-sync"],
      { revalidate: 60 * 30 }
    )();
  } catch (error) {
    console.error(
      "[thankbot] Slack roster sync failed:",
      error instanceof Error ? error.message : error
    );
  }
}
