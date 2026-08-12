import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, loginPath } from "@/lib/auth-paths";
import { supabasePublicKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session cookie on navigation so server components and
 * route handlers always see a valid token, and keeps the board itself behind
 * the sign-in page: visitors without a session only ever get `/login`.
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return withCookiesFrom(
        response,
        NextResponse.json({ error: "Sign in to use ThankBot." }, { status: 401 })
      );
    }

    return withCookiesFrom(
      response,
      NextResponse.redirect(
        new URL(loginPath(`${pathname}${search}`), request.url)
      )
    );
  }

  return response;
}

/** Carries any session cookies the refresh above set onto the final response. */
function withCookiesFrom(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

export const config = {
  matcher: [
    // Slack routes authenticate with a signing secret, so skip the session
    // refresh round trip that would eat into Slack's 3 second budget.
    "/((?!api/slack|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
