import { Leaderboard } from "@/components/Leaderboard";
import { ThanksCard } from "@/components/ThanksCard";
import { ThanksForm } from "@/components/ThanksForm";
import { getCurrentPerson, listPeople, listThanks } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const [thanks, people, currentPerson] = await Promise.all([
    listThanks(50),
    listPeople(),
    getCurrentPerson(),
  ]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-gradient-to-r from-white via-brand-50/50 to-aqua-50/40 px-5 py-4 shadow-sm sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-600">
            Appreciation board
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink-900">
            Thank a teammate
          </h1>
        </div>
        <div className="flex items-center gap-6 sm:gap-8">
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-brand-700">
              {thanks.length}
            </p>
            <p className="text-xs text-ink-500">recent thanks</p>
          </div>
          <div className="h-8 w-px bg-brand-100" aria-hidden />
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-brand-700">
              {people.length}
            </p>
            <p className="text-xs text-ink-500">people</p>
          </div>
        </div>
      </section>

      {searchParams.error ? (
        <p className="rounded-2xl border border-heart-200 bg-heart-50 px-4 py-3 text-sm text-heart-700">
          {searchParams.error}
        </p>
      ) : null}

      <ThanksForm currentPerson={currentPerson} people={people} />

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
              Latest thanks
            </h2>
          </div>
          {thanks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-10 text-center text-ink-500">
              No thanks yet. Send the first one above to get the board started.
            </div>
          ) : (
            <div className="space-y-3">
              {thanks.map((entry) => (
                <ThanksCard key={entry.id} thanks={entry} />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
            Most thanked
          </h2>
          <Leaderboard people={people} />
        </aside>
      </div>
    </div>
  );
}
