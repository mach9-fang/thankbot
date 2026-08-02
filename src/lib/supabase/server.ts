import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicKey, supabaseUrl } from "./env";

/**
 * Request-scoped client that reads the visitor's session from cookies, so RLS
 * policies see the signed-in user.
 */
export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(supabaseUrl(), supabasePublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; the middleware refreshes them.
        }
      },
    },
  });
}
