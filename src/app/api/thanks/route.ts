import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createThanks, listThanks } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getAuthUser())) {
    return NextResponse.json(
      { error: "Sign in to see the board." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50") || 50, 200);

  const thanks = await listThanks(limit);
  return NextResponse.json({ thanks });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const {
    to_person_id: toPersonId,
    to_person_ids: toPersonIds,
    reason,
  } = (body ?? {}) as {
    to_person_id?: unknown;
    to_person_ids?: unknown;
    reason?: unknown;
  };

  if (typeof reason !== "string") {
    return NextResponse.json({ error: "`reason` is required." }, { status: 400 });
  }

  const recipientIds = normalizeRecipientIds(toPersonIds, toPersonId);
  if (recipientIds.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one teammate to thank." },
      { status: 400 }
    );
  }

  const result = await createThanks({ toPersonIds: recipientIds, reason });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { thanks: result.thanks },
    { status: 201 }
  );
}

function normalizeRecipientIds(
  toPersonIds: unknown,
  toPersonId: unknown
): string[] {
  const ids: string[] = [];

  if (Array.isArray(toPersonIds)) {
    for (const value of toPersonIds) {
      if (typeof value === "string" && value && !ids.includes(value)) {
        ids.push(value);
      }
    }
  }

  if (ids.length === 0 && typeof toPersonId === "string" && toPersonId) {
    ids.push(toPersonId);
  }

  return ids;
}
