import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { ConfettiOnOpen } from "@/components/ConfettiOnOpen";
import { SlackCardActivity } from "@/components/SlackCardActivity";
import { formatThanksWhen } from "@/components/ThanksCard";
import { requireAuthUser } from "@/lib/auth";
import { getThanks, getThanksSlackRef } from "@/lib/db";
import { emojifyText } from "@/lib/emoji";
import { formatNameList } from "@/lib/format";
import { loadThanksSlackActivity } from "@/lib/slack-card";

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
    title: `${thanks.from_person.name} thanked ${formatNameList(
      thanks.to_people.map((person) => person.name)
    )} — ThankBot`,
    description: emojifyText(thanks.reason),
  };
}

export default async function ThanksPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAuthUser(`/thanks/${params.id}`);

  const thanks = await getThanks(params.id);
  if (!thanks) {
    notFound();
  }

  const reason = emojifyText(thanks.reason);
  const slackRef = await getThanksSlackRef(thanks.id);

  // A web card that was never meant to reach Slack has nothing to explain.
  const slackState =
    thanks.source === "slack" || slackRef.status === "announced"
      ? await loadThanksSlackActivity(thanks.id, slackRef)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ConfettiOnOpen />
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-ink-500 transition hover:text-brand-700"
      >
        ← Back to board
      </Link>

      <article className="overflow-hidden rounded-[2rem] border border-brand-200 bg-white shadow-lg shadow-brand-600/10">
        <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-5 sm:px-10 sm:py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-200">
            A thank you
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4 sm:gap-6">
            <Link
              href={`/people/${thanks.from_person.id}`}
              className="flex items-center gap-3 rounded-2xl transition hover:opacity-90"
            >
              <Avatar person={thanks.from_person} size="lg" />
              <div>
                <p className="text-xs uppercase tracking-wide text-brand-200">
                  From
                </p>
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
                  {thanks.from_person.name}
                </p>
              </div>
            </Link>

            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="hidden h-7 w-7 fill-heart-400 sm:block"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>

            <div>
              <p className="text-xs uppercase tracking-wide text-brand-200">
                To
              </p>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-3">
                {thanks.to_people.map((person) => (
                  <Link
                    key={person.id}
                    href={`/people/${person.id}`}
                    className="flex items-center gap-3 rounded-2xl transition hover:opacity-90"
                  >
                    <Avatar person={person} size="lg" />
                    <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-white">
                      {person.name}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white via-brand-50/50 to-aqua-50/60 px-6 py-10 sm:px-10 sm:py-14">
          <blockquote className="font-[family-name:var(--font-display)] text-3xl font-medium leading-snug tracking-tight text-ink-900 sm:text-4xl sm:leading-snug">
            “{reason}”
          </blockquote>

          <div className="mt-10 flex flex-wrap items-center gap-3 text-sm text-ink-500">
            <time dateTime={thanks.created_at}>
              {formatThanksWhen(thanks.created_at)}
            </time>
            <span aria-hidden>·</span>
            <span className="rounded-full bg-white/80 px-2.5 py-0.5 capitalize text-brand-700 ring-1 ring-brand-200">
              via {thanks.source}
            </span>
          </div>
        </div>

        {slackState ? <SlackCardActivity state={slackState} /> : null}
      </article>
    </div>
  );
}
