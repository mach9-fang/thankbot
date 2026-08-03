/**
 * One-shot import of Slack workspace members into `people`.
 *
 * Run: pnpm sync-slack
 * Needs SLACK_BOT_TOKEN + SUPABASE_SERVICE_ROLE_KEY in `.env.local`.
 */
import fs from "fs";
import path from "path";

loadEnvFile(".env.local");

async function main() {
  if (!process.env.SLACK_BOT_TOKEN) {
    console.error("Set SLACK_BOT_TOKEN in .env.local first.");
    process.exit(1);
  }
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !process.env.SUPABASE_SECRET_KEY
  ) {
    console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
    process.exit(1);
  }

  // Dynamic import after env load so Supabase clients see the keys.
  const { syncSlackRoster } = await import("../src/lib/sync-slack-roster");
  const result = await syncSlackRoster();
  if (result.skipped) {
    console.error("Slack sync skipped — missing SLACK_BOT_TOKEN.");
    process.exit(1);
  }
  console.log(`Synced ${result.synced} Slack teammates into people.`);
}

function loadEnvFile(filename: string) {
  const full = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
