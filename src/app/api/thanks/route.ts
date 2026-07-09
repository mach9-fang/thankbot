import { NextResponse } from "next/server";
import { listThanks } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Number(searchParams.get("limit") ?? "50") || 50,
    200
  );

  const thanks = listThanks(limit);
  return NextResponse.json({ thanks });
}
