import { NextResponse } from "next/server";
import { getPerson, listThanksForPerson } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const person = getPerson(params.id);
  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  const history = listThanksForPerson(params.id);
  return NextResponse.json({
    person,
    received: history.received,
    given: history.given,
  });
}
