import Link from "next/link";
import type { ThanksWithPeople } from "@/lib/types";
import { emojifyText } from "@/lib/emoji";
import { Avatar } from "./Avatar";

export function formatThanksWhen(iso: string) {
  const date = new Date(iso.includes("T") ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ThanksCard({ thanks }: { thanks: ThanksWithPeople }) {
  const reason = emojifyText(thanks.reason);

  return (
    <Link
      href={`/thanks/${thanks.id}`}
      className="group block rounded-2xl border border-brand-100/80 bg-white/80 p-5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md hover:shadow-brand-600/10"
    >
      <article className="flex items-start gap-4">
        <Avatar person={thanks.to_person} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-500">
            <span className="font-medium text-ink-800 group-hover:text-brand-700">
              {thanks.from_person.name}
            </span>{" "}
            thanked{" "}
            <span className="font-medium text-ink-800 group-hover:text-brand-700">
              {thanks.to_person.name}
            </span>
          </p>
          <p className="mt-2 text-lg leading-relaxed text-ink-900">
            “{reason}”
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-400">
            <time dateTime={thanks.created_at}>
              {formatThanksWhen(thanks.created_at)}
            </time>
            <span aria-hidden>·</span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 capitalize text-brand-700">
              {thanks.source}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
