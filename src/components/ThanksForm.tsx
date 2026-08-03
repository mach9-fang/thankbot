"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Person, PersonSummary } from "@/lib/types";

const MAX_REASON_LENGTH = 500;
const ALLOW_SELF_THANKS = process.env.NEXT_PUBLIC_ALLOW_SELF_THANKS === "true";

export function ThanksForm({
  currentPerson,
  people,
}: {
  currentPerson: Person | null;
  people: PersonSummary[];
}) {
  const router = useRouter();
  const [toPersonId, setToPersonId] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  const teammates = useMemo(
    () =>
      ALLOW_SELF_THANKS
        ? people
        : people.filter((person) => person.id !== currentPerson?.id),
    [people, currentPerson?.id]
  );

  if (!currentPerson) {
    return (
      <div className="rounded-2xl border border-brand-100 bg-white/80 p-6 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
          Say thanks
        </h2>
        <p className="mt-2 text-sm text-ink-600">
          Sign in with your work Google account to thank a teammate.
        </p>
        <a
          href="/auth/signin"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ink-800"
        >
          <GoogleMark />
          Sign in with Google
        </a>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("sending");

    try {
      const response = await fetch("/api/thanks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_person_id: toPersonId, reason }),
      });

      const payload = (await response.json()) as {
        error?: string;
        thanks?: { id: string };
      };

      if (!response.ok || !payload.thanks?.id) {
        setError(payload.error ?? "Could not send that thanks.");
        setStatus("idle");
        return;
      }

      router.push(`/thanks/${payload.thanks.id}`);
    } catch {
      setError("Network error — try again.");
      setStatus("idle");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-brand-100 bg-white/80 p-6 shadow-sm"
    >
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink-900">
        Say thanks
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        Posting as {currentPerson.name}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
        <label className="block">
          <span className="text-sm font-medium text-ink-700">Teammate</span>
          <select
            value={toPersonId}
            onChange={(event) => setToPersonId(event.target.value)}
            required
            className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            <option value="">Choose someone…</option>
            {teammates.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === currentPerson.id
                  ? `${person.name} (you)`
                  : person.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink-700">For what?</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MAX_REASON_LENGTH}
            required
            placeholder="reviewing my PR at midnight"
            className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>

      {teammates.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">
          No teammates on the board yet — once a colleague signs in, they show up
          here.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={status === "sending" || teammates.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-400 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Send thanks"}
        </button>
        {error ? <span className="text-sm text-heart-600">{error}</span> : null}
      </div>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1A6.2 6.2 0 1 1 15.9 7.3l2.7-2.6A9.9 9.9 0 0 0 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4.1 9.6-9.8 0-.7-.08-1.3-.2-2H12z"
      />
    </svg>
  );
}
