export type PeriodKind = "month" | "week";

export type TimeRange = {
  kind: PeriodKind;
  key: string;
  start: Date;
  end: Date;
  label: string;
};

const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const WEEK_KEY = /^(\d{4})-W(\d{2})$/;

export function parseTimeRangeParams(params: {
  period?: string;
  range?: string;
}): TimeRange {
  const kind: PeriodKind = params.period === "week" ? "week" : "month";
  const selected =
    kind === "week" ? parseWeekKey(params.range) : parseMonthKey(params.range);
  return selected ?? currentRange(kind);
}

export function currentRange(kind: PeriodKind, now = new Date()): TimeRange {
  if (kind === "week") {
    const { year, week } = isoWeekParts(now);
    return weekRange(year, week);
  }
  return monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

export function listPeriodOptions(
  kind: PeriodKind,
  earliestIso: string | null,
  selected?: TimeRange,
  now = new Date()
): TimeRange[] {
  const newest = currentRange(kind, now);
  const earliestDate = earliestIso ? new Date(earliestIso) : null;
  const oldest =
    earliestDate && !Number.isNaN(earliestDate.getTime())
      ? kind === "week"
        ? weekContaining(earliestDate)
        : monthContaining(earliestDate)
      : newest;

  const options: TimeRange[] = [];
  if (oldest.start.getTime() <= newest.start.getTime()) {
    let cursor = oldest;
    for (let i = 0; i < 400; i += 1) {
      options.push(cursor);
      if (cursor.key === newest.key) break;
      cursor =
        kind === "week"
          ? weekContaining(new Date(cursor.end.getTime()))
          : monthContaining(new Date(cursor.end.getTime()));
    }
  } else {
    options.push(newest);
  }

  if (
    selected &&
    selected.kind === kind &&
    !options.some((option) => option.key === selected.key)
  ) {
    options.push(selected);
  }

  return options.sort((a, b) => b.start.getTime() - a.start.getTime());
}

export function parseMonthKey(key: string | undefined): TimeRange | null {
  if (!key) return null;
  const match = MONTH_KEY.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return monthRange(year, month);
}

export function parseWeekKey(key: string | undefined): TimeRange | null {
  if (!key) return null;
  const match = WEEK_KEY.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const range = weekRange(year, week);
  const expected = `${year}-W${`0${week}`.slice(-2)}`;
  if (range.key !== expected) return null;
  return range;
}

function monthRange(year: number, month: number): TimeRange {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    kind: "month",
    key: `${year}-${`0${month}`.slice(-2)}`,
    start,
    end,
    label: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start),
  };
}

function weekRange(year: number, week: number): TimeRange {
  const start = isoWeekMonday(year, week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  const { year: isoYear, week: isoWeek } = isoWeekParts(start);
  return {
    kind: "week",
    key: `${isoYear}-W${`0${isoWeek}`.slice(-2)}`,
    start,
    end,
    label: formatWeekLabel(start, end),
  };
}

function monthContaining(date: Date): TimeRange {
  return monthRange(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function weekContaining(date: Date): TimeRange {
  const { year, week } = isoWeekParts(date);
  return weekRange(year, week);
}

function formatWeekLabel(start: Date, endExclusive: Date): string {
  const last = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  const year = last.getUTCFullYear();
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  if (start.getUTCMonth() === last.getUTCMonth()) {
    const month = new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(start);
    return `${month} ${start.getUTCDate()}–${last.getUTCDate()}, ${year}`;
  }

  return `${monthDay.format(start)} – ${monthDay.format(last)}, ${year}`;
}

function isoWeekParts(date: Date): { year: number; week: number } {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year, week };
}

function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (day - 1) + (week - 1) * 7);
  return monday;
}
