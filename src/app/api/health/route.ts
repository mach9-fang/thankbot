import { NextResponse } from "next/server";
import { readSchemaHealth } from "@/lib/schema-health";

export const dynamic = "force-dynamic";

/**
 * Deploy check: does the database have what this build expects?
 *
 * Reachable without a session (see PUBLIC_PATHS) so it is useful to a monitor
 * or a post-deploy step. It reports only which schema objects resolve — no
 * rows, names or counts — and answers 503 while a migration is outstanding, so
 * a pending migration trips an alarm instead of waiting to be discovered by
 * somebody trying to thank a teammate.
 */
export async function GET() {
  try {
    const health = await readSchemaHealth();

    if (!health.ok) {
      console.error(
        `Schema is behind this deploy. Apply: ${health.pendingMigrations.join(", ")}`
      );
    }

    return NextResponse.json(health, { status: health.ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not reach the database.",
      },
      { status: 503 }
    );
  }
}
