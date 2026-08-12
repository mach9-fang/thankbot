import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getAuthUser } from "@/lib/auth";
import { sanitizeNext } from "@/lib/auth-paths";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — ThankBot",
  description: "Sign in with your work Google account to see the ThankBot board.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = sanitizeNext(searchParams.next);

  // A configuration or Supabase problem should still render the sign-in card
  // rather than the app-wide error boundary.
  const user = await getAuthUser().catch((error) => {
    console.error("Login: could not read the current session", error);
    return null;
  });

  if (user) {
    redirect(next);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center sm:py-16">
      <Image
        src="/thankbot-icon.png"
        alt=""
        width={64}
        height={64}
        priority
        className="h-16 w-16 rounded-2xl shadow-sm"
      />

      <h1 className="mt-6 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900">
        Welcome to ThankBot
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-600">
        The appreciation board is private to the team. Sign in with your work
        Google account to see who has been thanked and to thank a teammate.
      </p>

      {searchParams.error ? (
        <p className="mt-6 w-full rounded-2xl border border-heart-200 bg-heart-50 px-4 py-3 text-sm text-heart-700">
          {searchParams.error}
        </p>
      ) : null}

      <div className="mt-8 w-full rounded-2xl border border-brand-100 bg-white/80 p-6 shadow-sm">
        <GoogleSignInButton next={next} className="w-full" />
        <p className="mt-4 text-xs text-ink-500">
          You can also say thanks from Slack with{" "}
          <code className="rounded bg-brand-50 px-1 py-0.5 text-brand-700">
            /thanks
          </code>
          .
        </p>
      </div>
    </div>
  );
}
