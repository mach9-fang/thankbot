import Link from "next/link";
import type { PersonSummary, ThanksWithPeople } from "@/lib/types";
import { emojifyText } from "@/lib/emoji";
import { formatNameList } from "@/lib/format";
import { Avatar } from "./Avatar";

/** Keep a feed row to one line of names however many people share the card. */
const NAMES_SHOWN = 3;

export function formatThanksWhen(iso: string) {
  const date = new Date(iso.includes("T") ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function summarizeRecipients(people: PersonSummary[]) {
  if (people.length <= NAMES_SHOWN) {
    return formatNameList(people.map((person) => person.name));
  }

  const shown = people.slice(0, NAMES_SHOWN).map((person) => person.name);
  const rest = people.length - NAMES_SHOWN;
  return formatNameList([...shown, `${rest} ${rest === 1 ? "other" : "others"}`]);
}

export function ThanksCard({ thanks }: { thanks: ThanksWithPeople }) {
  const reason = emojifyText(thanks.reason);
  const recipientNames = summarizeRecipients(thanks.to_people);
  const hiddenAvatars = thanks.to_people.length - NAMES_SHOWN;

  return (
    <Link
      href={`/thanks/${thanks.id}`}
      className="group block rounded-2xl border border-brand-100/80 bg-white/80 p-5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md hover:shadow-brand-600/10"
    >
      <article className="flex items-start gap-4">
        <div className="flex shrink-0 -space-x-3">
          {thanks.to_people.slice(0, NAMES_SHOWN).map((person) => (
            <Avatar key={person.id} person={person} />
          ))}
          {hiddenAvatars > 0 ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 ring-2 ring-white">
              +{hiddenAvatars}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-500">
            <span className="font-medium text-ink-800 group-hover:text-brand-700">
              {thanks.from_person.name}
            </span>{" "}
            thanked{" "}
            <span className="font-medium text-ink-800 group-hover:text-brand-700">
              {recipientNames}
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
