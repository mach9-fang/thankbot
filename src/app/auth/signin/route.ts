import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveOrigin } from "@/lib/supabase/origin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";
  const origin = resolveOrigin(request);

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(error?.message ?? "Could not start Google sign-in.")}`
    );
  }

  return NextResponse.redirect(data.url);
}
