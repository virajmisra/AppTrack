/** Date-bucketing for the Postings tab: assigns each posting to a "posted today / yesterday /
 * past week / past month / older" band and provides the cumulative window bounds the filter
 * chips use. Pure — no `server-only` / `"use client"` — but bucketing is meant to run in the
 * browser against `Date.now()` so "today" tracks the viewer's local clock. */

export type DateBucket = "today" | "yesterday" | "past_week" | "past_month" | "older";

/** Newest-first — the order sections render in and chips appear in. */
export const BUCKET_ORDER: DateBucket[] = [
  "today",
  "yesterday",
  "past_week",
  "past_month",
  "older",
];

export const BUCKET_LABELS: Record<DateBucket, string> = {
  today: "Posted today",
  yesterday: "Yesterday",
  past_week: "Past week",
  past_month: "Past month",
  older: "Older",
};

/** Shorter labels for the filter chips (where "Posted today" is redundant). */
export const BUCKET_CHIP_LABELS: Record<DateBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  past_week: "Past week",
  past_month: "Past month",
  older: "Older",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight of the day containing `now`. Uses `setHours(0,0,0,0)` rather than
 * `now - n*DAY_MS` so day boundaries land on the wall clock and DST transitions don't shift
 * "today" by an hour. */
export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The single bucket a timestamp belongs to — used to group rows under section headers. */
export function assignBucket(ts: number, now: number): DateBucket {
  const startToday = startOfLocalDay(now);
  if (ts >= startToday) return "today";
  if (ts >= startToday - DAY_MS) return "yesterday";
  if (ts >= startToday - 7 * DAY_MS) return "past_week";
  if (ts >= startToday - 30 * DAY_MS) return "past_month";
  return "older";
}

/** Inclusive lower bound for a *cumulative* filter: selecting "Past week" keeps everything from
 * the past week including today and yesterday. `older` (and anything unrecognised) imposes no
 * bound. */
export function bucketWindowStart(bucket: DateBucket, now: number): number {
  const startToday = startOfLocalDay(now);
  switch (bucket) {
    case "today":
      return startToday;
    case "yesterday":
      return startToday - DAY_MS;
    case "past_week":
      return startToday - 7 * DAY_MS;
    case "past_month":
      return startToday - 30 * DAY_MS;
    case "older":
    default:
      return Number.NEGATIVE_INFINITY;
  }
}
