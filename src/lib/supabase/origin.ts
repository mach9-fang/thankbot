import { siteUrl } from "./env";

/**
 * Public origin for OAuth redirects. `NEXT_PUBLIC_SITE_URL` wins in production
 * so Vercel preview proxies can't send Google to an internal hostname.
 */
export function resolveOrigin(request: Request): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return siteUrl();
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}
