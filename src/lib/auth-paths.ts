/**
 * Route helpers shared by the middleware (edge runtime) and the server-side
 * guards, kept free of Supabase/database imports so the middleware bundle stays
 * small.
 */

/** Paths that render (or run) without a session; everything else is gated. */
export const PUBLIC_PATHS = [
  "/login",
  "/auth/signin",
  "/auth/callback",
  "/auth/signout",
  // Slack authenticates with its signing secret, not Google. Middleware also
  // skips `/api/slack` in its matcher so the session lookup does not eat into
  // Slack's 3 second budget; this entry is the documented hole if that matcher
  // ever changes.
  "/api/slack",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/**
 * Keeps `?next=` pointing at this app: anything that is not a plain absolute
 * path (including protocol-relative URLs) falls back to the board.
 */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export function loginPath(next?: string | null): string {
  const target = sanitizeNext(next);
  return target === "/" ? "/login" : `/login?next=${encodeURIComponent(target)}`;
}
