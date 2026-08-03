import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { formatThanksWhen } from "@/components/ThanksCard";
import { getThanks } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const thanks = await getThanks(params.id);
  if (!thanks) {
    return { title: "Thanks not found — ThankBot" };
  }

  return {
    title: `${thanks.from_person.name} thanked ${thanks.to_person.name} — ThankBot`,
    description: thanks.reason,
  };
}

export default async function ThanksPage({
  params,
}: {
  params: { id: string };
}) {
  const thanks = await getThanks(params.id);
  if (!thanks) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-stone-500 transition hover:text-rose-600"
      >
        ← Back to board
      </Link>

      <article className="overflow-hidden rounded-[2rem] border border-rose-100 bg-gradient-to-br from-white via-rose-50/50 to-orange-50/60 shadow-sm">
        <div className="border-b border-rose-100/80 bg-white/50 px-6 py-5 sm:px-10 sm:py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
            A thank you
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4 sm:gap-6">
            <Link
              href={`/people/${thanks.from_person.id}`}
              className="flex items-center gap-3 rounded-2xl transition hover:opacity-90"
            >
              <Avatar person={thanks.from_person} size="lg" />
              <div>
                <p className="text-xs uppercase tracking-wide text-stone-400">
                  From
                </p>
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-stone-900">
                  {thanks.from_person.name}
                </p>
              </div>
            </Link>

            <span
              aria-hidden
              className="hidden text-2xl text-rose-300 sm:inline"
            >
              →
            </span>

            <Link
              href={`/people/${thanks.to_person.id}`}
              className="flex items-center gap-3 rounded-2xl transition hover:opacity-90"
            >
              <Avatar person={thanks.to_person} size="lg" />
              <div>
                <p className="text-xs uppercase tracking-wide text-stone-400">
                  To
                </p>
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-stone-900">
                  {thanks.to_person.name}
                </p>
              </div>
            </Link>
          </div>
        </div>

        <div className="px-6 py-10 sm:px-10 sm:py-14">
          <blockquote className="font-[family-name:var(--font-display)] text-3xl font-medium leading-snug tracking-tight text-stone-900 sm:text-4xl sm:leading-snug">
            “{thanks.reason}”
          </blockquote>

          <div className="mt-10 flex flex-wrap items-center gap-3 text-sm text-stone-500">
            <time dateTime={thanks.created_at}>
              {formatThanksWhen(thanks.created_at)}
            </time>
            <span aria-hidden>·</span>
            <span className="rounded-full bg-white/80 px-2.5 py-0.5 capitalize text-stone-600 ring-1 ring-stone-200/80">
              via {thanks.source}
            </span>
          </div>
        </div>
      </article>
    </div>
  );
}
