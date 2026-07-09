import { NextResponse } from "next/server";
import { listPeople } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const people = listPeople();
  return NextResponse.json({ people });
}
