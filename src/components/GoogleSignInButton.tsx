import { sanitizeNext } from "@/lib/auth-paths";

export function GoogleSignInButton({
  next,
  className = "",
}: {
  next?: string;
  className?: string;
}) {
  const target = sanitizeNext(next);
  const href =
    target === "/"
      ? "/auth/signin"
      : `/auth/signin?next=${encodeURIComponent(target)}`;

  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-800 ${className}`}
    >
      <GoogleMark />
      Sign in with Google
    </a>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1A6.2 6.2 0 1 1 15.9 7.3l2.7-2.6A9.9 9.9 0 0 0 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4.1 9.6-9.8 0-.7-.08-1.3-.2-2H12z"
      />
    </svg>
  );
}
