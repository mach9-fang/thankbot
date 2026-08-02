import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveOrigin } from "@/lib/supabase/origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${resolveOrigin(request)}/`, { status: 303 });
}
