"use client";

export default function Error({ error }: { error: Error }) {
  return (
    <div className="rounded-3xl border border-rose-200 bg-white/80 p-8 shadow-sm">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-stone-900">
        The board couldn&apos;t load
      </h1>
      <p className="mt-2 text-sm text-stone-600">{error.message}</p>
      <ul className="mt-5 space-y-2 text-sm text-stone-600">
        <li>
          Check <code className="rounded bg-stone-100 px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>
          .
        </li>
        <li>
          Run <code className="rounded bg-stone-100 px-1.5 py-0.5">supabase/migrations/0001_init.sql</code>{" "}
          if the tables don&apos;t exist yet.
        </li>
      </ul>
    </div>
  );
}
