import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session cookie on navigation so server components and
 * route handlers always see a valid token.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  let url: string;
  let publicKey: string;
  try {
    url = supabaseUrl();
    publicKey = supabasePublicKey();
  } catch {
    // Let pages surface the configuration problem instead of failing here.
    return response;
  }

  const supabase = createServerClient(url, publicKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Slack routes authenticate with a signing secret, so skip the session
    // refresh round trip that would eat into Slack's 3 second budget.
    "/((?!api/slack|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
