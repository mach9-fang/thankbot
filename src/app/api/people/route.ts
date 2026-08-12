import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { listPeople } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAuthUser())) {
    return NextResponse.json(
      { error: "Sign in to see the board." },
      { status: 401 }
    );
  }

  const people = await listPeople();
  return NextResponse.json({ people });
}
