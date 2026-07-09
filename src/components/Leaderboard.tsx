import Link from "next/link";
import type { PersonWithStats } from "@/lib/types";
import { Avatar } from "./Avatar";

export function Leaderboard({ people }: { people: PersonWithStats[] }) {
  const top = people.filter((p) => p.thanks_received > 0).slice(0, 8);

  if (top.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white/50 p-6 text-sm text-stone-500">
        No thanks yet — be the first to send one from Slack with{" "}
        <code className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-700">
          /thanks
        </code>
        .
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {top.map((person, index) => (
        <li key={person.id}>
          <Link
            href={`/people/${person.id}`}
            className="flex items-center gap-3 rounded-xl border border-transparent bg-white/70 px-3 py-2.5 transition hover:border-rose-100 hover:bg-white hover:shadow-sm"
          >
            <span className="w-5 text-center text-sm font-semibold text-stone-400">
              {index + 1}
            </span>
            <Avatar person={person} size="sm" />
            <span className="min-w-0 flex-1 truncate font-medium text-stone-800">
              {person.name}
            </span>
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600">
              {person.thanks_received}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
