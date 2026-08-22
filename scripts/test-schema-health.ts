/**
 * The deploy check has to tell the truth about whichever schema and Slack
 * install are live, and must never record a thanks while probing.
 *
 * Run against a migrated database and one still missing
 * `0004_group_thanks_recipients.sql`:
 *   pnpm tsx scripts/test-schema-health.ts
 *
 * Needs local Supabase running and `.env.local` in place.
 */
import assert from "assert";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "./load-env";
import { installSlackStub } from "./slack-stub";

loadEnvFile(".env.local");

const BOT = "xoxb-health-test";
const USER = "xoxp-health-test";
const CURRENT_SCOPES = [
  "commands",
  "chat:write",
  "channels:join",
  "reactions:read",
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "users:read",
];

async function main() {
  process.env.SLACK_BOT_TOKEN = BOT;
  // Owned by this test, not by whatever .env.local happens to carry.
  delete process.env.SLACK_USER_TOKEN;
  // Keep the probe off the network: a real Slack call would make this test
  // depend on the workspace it happens to run next to.
  let slack = installSlackStub({
    users: {},
    channels: {},
    tokenOwners: { [BOT]: "B_THANKBOT" },
    grantedScopes: CURRENT_SCOPES,
  });
  const { readSchemaHealth } = await import("../src/lib/schema-health");
  const { GET } = await import("../src/app/api/health/route");
  const { isPublicPath } = await import("../src/lib/auth-paths");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  assert.ok(
    isPublicPath("/api/health"),
    "a monitor with no session must be able to reach the check"
  );

  async function thanksCount() {
    const { count, error } = await admin
      .from("thanks")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  const before = await thanksCount();

  // What the database actually has, decided independently of the code above.
  const grouped = !(
    await admin.from("thank_recipients").select("thanks_id").limit(1)
  ).error;

  const health = await readSchemaHealth();
  console.log(`schema: ${health.shape}`, JSON.stringify(health.objects));

  assert.strictEqual(
    health.shape,
    grouped ? "grouped" : "legacy",
    "the check disagrees with the live schema"
  );
  assert.strictEqual(health.objects.thank_recipients, grouped);
  assert.strictEqual(health.objects.create_thanks_card, grouped);

  const slackIdentity = !(
    await admin.from("thanks").select("slack_channel_id").limit(1)
  ).error;
  assert.strictEqual(health.objects.slack_message_identity, slackIdentity);

  const expectedPending: string[] = [];
  if (!grouped) expectedPending.push("0004_group_thanks_recipients.sql");
  if (!slackIdentity) expectedPending.push("0006_slack_message_identity.sql");

  assert.strictEqual(
    health.ok,
    expectedPending.length === 0,
    "a database missing a required migration must not report healthy"
  );
  assert.deepStrictEqual(health.pendingMigrations, expectedPending);

  // Probing must not write. This is the whole reason the probe passes an empty
  // recipient list rather than a real one.
  assert.strictEqual(
    await thanksCount(),
    before,
    "the health check recorded a thanks while probing"
  );

  const response = await GET();
  const body = await response.json();
  const healthy = expectedPending.length === 0;
  assert.strictEqual(
    response.status,
    healthy ? 200 : 503,
    `expected ${healthy ? 200 : 503}, got ${response.status}: ${JSON.stringify(body)}`
  );
  assert.strictEqual(body.ok, healthy);

  // Nothing about the board itself may leak from an unauthenticated route.
  const serialized = JSON.stringify(body);
  for (const leak of ["reason", "email", "avatar_url", "@"]) {
    assert.ok(
      !serialized.includes(leak),
      `the check exposed "${leak}": ${serialized}`
    );
  }

  assert.strictEqual(
    await thanksCount(),
    before,
    "the health route recorded a thanks while probing"
  );

  assert.deepStrictEqual(health.slack.missingScopes, []);
  assert.strictEqual(health.slack.configured, true);
  assert.strictEqual(
    health.slack.user,
    undefined,
    "an optional user token that is not set is not a fault"
  );

  // A user token is how a private channel or a DM works without an invite, so
  // one that cannot read them has to be as visible as a missing bot scope.
  process.env.SLACK_USER_TOKEN = USER;
  slack.restore();
  slack = installSlackStub({
    users: {},
    channels: {},
    tokenOwners: { [BOT]: "B_THANKBOT", [USER]: "U_INSTALLER" },
    grantedScopes: CURRENT_SCOPES,
  });
  try {
    const withUser = await GET();
    const body = await withUser.json();
    assert.strictEqual(withUser.status, 200, JSON.stringify(body));
    assert.deepStrictEqual(body.slack.user.missingScopes, []);

    slack.restore();
    slack = installSlackStub({
      users: {},
      channels: {},
      tokenOwners: { [BOT]: "B_THANKBOT", [USER]: "U_INSTALLER" },
      grantedScopes: ["commands", "chat:write", "channels:join", "users:read"],
    });
    const stale = await GET();
    const staleBody = await stale.json();
    assert.strictEqual(stale.status, 503, JSON.stringify(staleBody));
    assert.deepStrictEqual(staleBody.slack.user.missingScopes, [
      "reactions:read",
      "channels:history",
      "groups:history",
      "im:history",
      "mpim:history",
    ]);
  } finally {
    delete process.env.SLACK_USER_TOKEN;
  }

  slack.restore();
  slack = installSlackStub({
    users: {},
    channels: {},
    tokenOwners: { [BOT]: "B_THANKBOT" },
    grantedScopes: CURRENT_SCOPES,
  });

  // Slack scopes are granted by hand too, and a release that needs a new one
  // is just as broken as a release missing a migration.
  slack.restore();
  slack = installSlackStub({
    users: {},
    channels: {},
    tokenOwners: { [BOT]: "B_THANKBOT" },
    grantedScopes: ["commands", "chat:write", "users:read"],
  });
  try {
    const stale = await GET();
    const staleBody = await stale.json();
    assert.strictEqual(
      stale.status,
      503,
      `a Slack app that was never reinstalled must fail the check: ${JSON.stringify(staleBody)}`
    );
    assert.deepStrictEqual(staleBody.slack.missingScopes, [
      "channels:join",
      "reactions:read",
      "channels:history",
      "groups:history",
      "im:history",
      "mpim:history",
    ]);
  } finally {
    slack.restore();
  }

  console.log("schema health tests passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
