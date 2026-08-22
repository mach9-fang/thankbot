import type { SlackCardActivity as SlackCardActivityData } from "@/lib/types";
import { Avatar } from "./Avatar";
import { formatThanksWhen } from "./ThanksCard";

export function SlackCardActivity({
  activity,
}: {
  activity: SlackCardActivityData;
}) {
  const hasReactions = activity.reactions.length > 0;
  const hasComments = activity.comments.length > 0;
  if (!hasReactions && !hasComments) return null;

  return (
    <div className="border-t border-brand-100 bg-white/70 px-6 py-6 sm:px-10 sm:py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
        On Slack
      </p>

      {hasReactions ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Slack reactions">
          {activity.reactions.map((reaction) => (
            <li
              key={reaction.name}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-sm text-ink-800 ring-1 ring-brand-200"
            >
              <span aria-hidden className="text-base leading-none">
                {reaction.emoji}
              </span>
              <span className="tabular-nums text-ink-600">{reaction.count}</span>
              <span className="sr-only">
                {reaction.count} {reaction.name}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasComments ? (
        <ul className="mt-5 space-y-4" aria-label="Slack thread replies">
          {activity.comments.map((comment) => (
            <li key={comment.ts} className="flex items-start gap-3">
              <Avatar person={comment.person} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium text-ink-800">
                    {comment.person.name}
                  </p>
                  <time
                    dateTime={comment.created_at}
                    className="text-xs text-ink-400"
                  >
                    {formatThanksWhen(comment.created_at)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                  {comment.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
