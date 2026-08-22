import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SignOutButton } from "@/components/SignOutButton";
import { ThanksCard } from "@/components/ThanksCard";
import { requireAuthUser } from "@/lib/auth";
import { getPerson, listThanksForPerson } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PersonPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuthUser(`/people/${params.id}`);

  const person = await getPerson(params.id);
  if (!person) {
    notFound();
  }

  const { received, given } = await listThanksForPerson(params.id);
  const isOwnProfile = person.auth_user_id === user.id;

  return (
    <div className="space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-ink-500 transition hover:text-brand-700"
      >
        ← Back to board
      </Link>

      <section className="flex items-start justify-between gap-4 rounded-3xl border border-brand-100 bg-white/80 p-6 shadow-sm sm:p-8">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Avatar person={person} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink-900">
              {person.name}
            </h1>
            {person.email ? (
              <p className="mt-1 truncate text-sm text-ink-500">
                {person.email}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-xl bg-heart-50 px-3 py-2">
                <p className="text-lg font-semibold text-heart-700">
                  {received.length}
                </p>
                <p className="text-xs text-heart-600">thanks received</p>
              </div>
              <div className="rounded-xl bg-brand-50 px-3 py-2">
                <p className="text-lg font-semibold text-brand-700">
                  {given.length}
                </p>
                <p className="text-xs text-brand-600">thanks given</p>
              </div>
            </div>
          </div>
        </div>
        {isOwnProfile ? (
          <div className="shrink-0">
            <SignOutButton />
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
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
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
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
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-8 text-center text-ink-500">
      {message}
    </div>
  );
}
