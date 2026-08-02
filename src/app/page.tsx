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
    <div className="space-y-8">
      <section className="rounded-3xl border border-rose-100 bg-gradient-to-br from-white via-rose-50/40 to-orange-50/50 p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-wider text-rose-500">
          Appreciation board
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          Thank a teammate
        </h1>
        <p className="mt-3 max-w-2xl text-stone-600">
          Sign in with your work Google account, pick a colleague, and say what
          they did. Every thanks lands on the feed below so the whole team can
          celebrate.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
            <p className="text-2xl font-semibold text-stone-900">
              {thanks.length}
            </p>
            <p className="text-xs text-stone-500">recent thanks</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
            <p className="text-2xl font-semibold text-stone-900">
              {people.length}
            </p>
            <p className="text-xs text-stone-500">people</p>
          </div>
        </div>
      </section>

      {searchParams.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {searchParams.error}
        </p>
      ) : null}

      <ThanksForm currentPerson={currentPerson} people={people} />

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">
              Latest thanks
            </h2>
          </div>
          {thanks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-10 text-center text-stone-500">
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
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">
            Most thanked
          </h2>
          <Leaderboard people={people} />
        </aside>
      </div>
    </div>
  );
}
