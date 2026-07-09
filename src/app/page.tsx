import { Leaderboard } from "@/components/Leaderboard";
import { ThanksCard } from "@/components/ThanksCard";
import { listPeople, listThanks } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const thanks = listThanks(50);
  const people = listPeople();
  const totalThanks = thanks.length;
  const totalPeople = people.length;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-rose-100 bg-gradient-to-br from-white via-rose-50/40 to-orange-50/50 p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-wider text-rose-500">
          Appreciation board
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          See who thanked you
        </h1>
        <p className="mt-3 max-w-2xl text-stone-600">
          Teammates shout out each other in Slack with{" "}
          <code className="rounded bg-white/80 px-1.5 py-0.5 text-sm text-stone-800">
            /thanks @person for …
          </code>
          . Every shout-out lands here so the whole team can celebrate.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
            <p className="text-2xl font-semibold text-stone-900">{totalThanks}</p>
            <p className="text-xs text-stone-500">recent thanks</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
            <p className="text-2xl font-semibold text-stone-900">{totalPeople}</p>
            <p className="text-xs text-stone-500">people</p>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">
              Latest thanks
            </h2>
          </div>
          {thanks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-10 text-center text-stone-500">
              No thanks yet. Send one from Slack to get the board started.
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
