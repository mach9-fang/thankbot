import Image from "next/image";
import Link from "next/link";
import { getCurrentPerson } from "@/lib/db";
import { Avatar } from "./Avatar";

export async function Header() {
  // The header lives in the layout, so a Supabase outage or missing config
  // should degrade to the signed-out state (brand only) rather than blank the
  // whole app. Signing in happens on /login, the one page visitors can reach.
  const currentPerson = await getCurrentPerson().catch((error) => {
    console.error("Header: could not load the current person", error);
    return null;
  });

  return (
    <header className="border-b border-brand-100/80 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/thankbot-icon.png"
            alt=""
            width={36}
            height={36}
            priority
            className="h-9 w-9 rounded-xl shadow-sm"
          />
          <div>
            <p className="text-base font-semibold tracking-tight text-ink-900">
              ThankBot
            </p>
            <p className="text-xs text-ink-500">Celebrate your teammates</p>
          </div>
        </Link>

        {currentPerson ? (
          <Link
            href={`/people/${currentPerson.id}`}
            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-white"
          >
            <Avatar person={currentPerson} size="sm" />
            <span className="hidden text-sm font-medium text-ink-800 sm:block">
              {currentPerson.name}
            </span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}
