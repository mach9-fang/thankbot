"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { PeriodKind } from "@/lib/time-range";

export function TimeRangeSelector({
  kind,
  rangeKey,
  options,
}: {
  kind: PeriodKind;
  rangeKey: string;
  options: { key: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(nextKind: PeriodKind, nextRange?: string) {
    const params = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search
    );
    params.set("period", nextKind);
    if (nextRange) {
      params.set("range", nextRange);
    } else {
      params.delete("range");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Time range"
        className="inline-flex rounded-xl border border-brand-100 bg-white/80 p-1 shadow-sm"
      >
        <PeriodButton
          active={kind === "month"}
          onClick={() => {
            if (kind !== "month") navigate("month");
          }}
        >
          Monthly
        </PeriodButton>
        <PeriodButton
          active={kind === "week"}
          onClick={() => {
            if (kind !== "week") navigate("week");
          }}
        >
          Weekly
        </PeriodButton>
      </div>

      <label className="relative inline-flex min-w-[15rem] flex-1 sm:max-w-xs sm:flex-none">
        <span className="sr-only">
          {kind === "week" ? "Choose week" : "Choose month"}
        </span>
        <select
          value={rangeKey}
          onChange={(event) => navigate(kind, event.target.value)}
          className="w-full appearance-none rounded-xl border border-brand-100 bg-white/80 py-2 pl-3 pr-9 text-sm font-medium text-ink-800 shadow-sm outline-none transition hover:border-brand-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        >
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </label>
    </div>
  );
}

function PeriodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-ink-900 text-white shadow-sm"
          : "text-ink-500 hover:bg-white hover:text-ink-800"
      }`}
    >
      {children}
    </button>
  );
}
