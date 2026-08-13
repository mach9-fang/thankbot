/**
 * The deploy check has to tell the truth about whichever schema is live, and
 * must never record a thanks while probing.
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

loadEnvFile(".env.local");

async function main() {
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
  assert.strictEqual(
    health.ok,
    grouped,
    "a database missing 0004 must not report healthy"
  );

  if (grouped) {
    assert.deepStrictEqual(health.pendingMigrations, []);
  } else {
    assert.deepStrictEqual(health.pendingMigrations, [
      "0004_group_thanks_recipients.sql",
    ]);
  }

  // Probing must not write. This is the whole reason the probe passes an empty
  // recipient list rather than a real one.
  assert.strictEqual(
    await thanksCount(),
    before,
    "the health check recorded a thanks while probing"
  );

  const response = await GET();
  const body = await response.json();
  assert.strictEqual(
    response.status,
    grouped ? 200 : 503,
    `expected ${grouped ? 200 : 503}, got ${response.status}: ${JSON.stringify(body)}`
  );
  assert.strictEqual(body.ok, grouped);

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

  console.log("schema health tests passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
