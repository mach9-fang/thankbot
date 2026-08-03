import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/db";
import { syncSlackRoster } from "@/lib/sync-slack-roster";

export const dynamic = "force-dynamic";

/**
 * Manually trigger (and diagnose) the Slack roster sync. Visit while signed
 * in to see exactly why teammates are not appearing — e.g. missing
 * SLACK_BOT_TOKEN or a Slack API error like `missing_scope`.
 */
export async function GET() {
  const person = await getCurrentPerson();
  if (!person) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const result = await syncSlackRoster();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export const POST = GET;
