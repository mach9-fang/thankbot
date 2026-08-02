import { NextResponse } from "next/server";
import { createThanks, listThanks } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

  const { to_person_id: toPersonId, reason } = (body ?? {}) as {
    to_person_id?: unknown;
    reason?: unknown;
  };

  if (typeof toPersonId !== "string" || typeof reason !== "string") {
    return NextResponse.json(
      { error: "`to_person_id` and `reason` are required." },
      { status: 400 }
    );
  }

  const result = await createThanks({ toPersonId, reason });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ thanks: result.thanks }, { status: 201 });
}
