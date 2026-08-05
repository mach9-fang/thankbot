"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Person, PersonSummary } from "@/lib/types";
import { PersonTypeahead } from "./PersonTypeahead";

const MAX_REASON_LENGTH = 500;
const ALLOW_SELF_THANKS = process.env.NEXT_PUBLIC_ALLOW_SELF_THANKS === "true";

type FormPerson = PersonSummary & { email?: string | null };

export function ThanksForm({
  currentPerson,
  people,
}: {
  currentPerson: Person | null;
  people: FormPerson[];
}) {
  const router = useRouter();
  const [recipients, setRecipients] = useState<FormPerson[]>([]);
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

    if (recipients.length === 0) {
      setError("Pick at least one teammate.");
      return;
    }

    setStatus("sending");

    try {
      const response = await fetch("/api/thanks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_person_ids: recipients.map((person) => person.id),
          reason,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        thanks?: { id: string };
        thanks_list?: { id: string }[];
      };

      const created =
        payload.thanks_list ?? (payload.thanks ? [payload.thanks] : []);

      if (!response.ok || created.length === 0) {
        setError(payload.error ?? "Could not send that thanks.");
        setStatus("idle");
        return;
      }

      if (created.length === 1) {
        router.push(`/thanks/${created[0].id}`);
        return;
      }

      setRecipients([]);
      setReason("");
      setStatus("idle");
      router.push("/");
      router.refresh();
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

      <label className="mt-4 block">
        <span className="text-sm font-medium text-ink-700">To whom</span>
        <div className="mt-1.5">
          <PersonTypeahead
            people={teammates}
            selected={recipients}
            onChange={setRecipients}
            disabled={status === "sending"}
            placeholder="Search Mach9 teammates…"
          />
        </div>
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="text-sm font-medium text-ink-700">For what</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MAX_REASON_LENGTH}
            required
            placeholder="reviewing my PR at midnight"
            className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <button
          type="submit"
          disabled={status === "sending" || teammates.length === 0}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-400 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:mb-0"
        >
          {status === "sending" ? "Sending…" : "Send"}
        </button>
      </div>

      {teammates.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">
          No teammates on the board yet — once a colleague signs in, they show up
          here.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-right text-sm text-heart-600">{error}</p>
      ) : null}
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
