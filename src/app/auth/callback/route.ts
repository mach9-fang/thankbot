import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveOrigin } from "@/lib/supabase/origin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const origin = resolveOrigin(request);

  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(oauthError)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(error.message)}`
    );
  }

  // Create or claim this employee's row so they can send and receive thanks.
  await getCurrentPerson();

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
