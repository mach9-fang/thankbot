import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { ThanksCard } from "@/components/ThanksCard";
import { getPerson, listThanksForPerson } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function PersonPage({
  params,
}: {
  params: { id: string };
}) {
  const person = getPerson(params.id);
  if (!person) {
    notFound();
  }

  const { received, given } = listThanksForPerson(params.id);

  return (
    <div className="space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-stone-500 transition hover:text-rose-600"
      >
        ← Back to board
      </Link>

      <section className="flex flex-col items-start gap-5 rounded-3xl border border-rose-100 bg-white/80 p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
        <Avatar person={person} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-stone-900">
            {person.name}
          </h1>
          <p className="mt-1 truncate text-sm text-stone-500">ID: {person.id}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="rounded-xl bg-rose-50 px-3 py-2">
              <p className="text-lg font-semibold text-rose-700">
                {received.length}
              </p>
              <p className="text-xs text-rose-500">thanks received</p>
            </div>
            <div className="rounded-xl bg-stone-100 px-3 py-2">
              <p className="text-lg font-semibold text-stone-700">
                {given.length}
              </p>
              <p className="text-xs text-stone-500">thanks given</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">
          Thanks received
        </h2>
        {received.length === 0 ? (
          <EmptyState message="No thanks received yet." />
        ) : (
          <div className="space-y-3">
            {received.map((entry) => (
              <ThanksCard key={entry.id} thanks={entry} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-stone-900">
          Thanks given
        </h2>
        {given.length === 0 ? (
          <EmptyState message="Hasn't thanked anyone yet." />
        ) : (
          <div className="space-y-3">
            {given.map((entry) => (
              <ThanksCard key={entry.id} thanks={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-200 bg-white/60 p-8 text-center text-stone-500">
      {message}
    </div>
  );
}
