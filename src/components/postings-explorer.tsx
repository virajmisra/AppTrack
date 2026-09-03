"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { FitBadge, TIER_ORDER, fitLabel } from "@/components/fit-badge";
import { PostingListHeader, PostingRow } from "@/components/posting-row";
import { useNewPostingIds } from "@/components/use-new-postings";
import {
  assignBucket,
  bucketWindowStart,
  BUCKET_CHIP_LABELS,
  BUCKET_LABELS,
  BUCKET_ORDER,
  type DateBucket,
} from "@/lib/date-buckets";
import type { InterviewFit, PostingRowData } from "@/types/database";

type DateFilter = "all" | DateBucket;
type TierFilter = "all" | InterviewFit;
/** "newest" groups under date-bucket headings (the original behaviour); "opportunity" regroups
 * the same rows under tier headings, best-first, still newest-first inside each tier. */
type SortMode = "newest" | "opportunity";

const SORT_OPTIONS: SegmentedOption<SortMode>[] = [
  { value: "newest", label: "Newest" },
  { value: "opportunity", label: "Opportunity" },
];

/** One rendered group of rows — a date bucket or a tier, depending on the sort mode. */
interface Section {
  key: string;
  label: string;
  /** Set only in "opportunity" mode, so the heading can carry the tier badge. */
  fit?: InterviewFit;
  rows: PostingRowData[];
}

const subscribeToMinute = (callback: () => void) => {
  const id = setInterval(callback, 60_000);
  return () => clearInterval(id);
};

/** Current time for date bucketing. Server (and the first client render, for hydration parity)
 * uses `seed`; after mount the browser's own clock takes over, floored to the minute so the
 * snapshot stays referentially stable between renders and buckets re-evaluate once a minute. */
function useBucketingNow(seed: number): number {
  return useSyncExternalStore(
    subscribeToMinute,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => seed
  );
}

export function PostingsExplorer({
  postings,
  hiddenCount,
  totalActiveCount,
  nowSeed,
}: {
  postings: PostingRowData[];
  /** How many of `postings` carry `hidden: true`. Passed rather than derived so the toggle can
   * be rendered before the filtering memo runs. */
  hiddenCount: number;
  totalActiveCount: number;
  /** Server's `Date.now()` at request time — the initial value keeps SSR and first client
   * render identical; a mount effect swaps in the real client clock. */
  nowSeed: number;
}) {
  const now = useBucketingNow(nowSeed);
  // Diffed against this browser's last visit, so it covers every posting the server sent —
  // hidden ones included — regardless of the filters in force below.
  const newIds = useNewPostingIds(postings);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");
  /** Hidden postings are excluded from every count and grouping until this is on, so the default
   * view behaves exactly as it did before hiding existed. */
  const [showHidden, setShowHidden] = useState(false);

  const query = search.trim().toLowerCase();

  const { sections, shownCount, newCount, dateCounts, tierCounts } = useMemo(() => {
    // Everything below — chip counts included — works off this set, so the numbers on the date
    // and tier chips always describe what "All" would actually show.
    const base = showHidden ? postings : postings.filter((p) => !p.hidden);

    const dateCounts: Record<DateFilter, number> = {
      all: base.length,
      today: 0,
      yesterday: 0,
      past_week: 0,
      past_month: 0,
      older: 0,
    };
    const tierCounts: Record<TierFilter, number> = {
      all: base.length,
      ready_now: 0,
      target: 0,
      reach: 0,
      unrated: 0,
    };
    for (const p of base) {
      dateCounts[assignBucket(p.postedTs, now)] += 1;
      tierCounts[p.interviewFit] += 1;
    }

    const windowStart =
      dateFilter === "all" ? Number.NEGATIVE_INFINITY : bucketWindowStart(dateFilter, now);

    const filtered = base.filter((p) => {
      if (p.postedTs < windowStart) return false;
      if (tierFilter !== "all" && p.interviewFit !== tierFilter) return false;
      if (query && !`${p.company} ${p.title}`.toLowerCase().includes(query)) return false;
      return true;
    });

    // `postings` arrives newest-first from the server, and both groupings below preserve input
    // order within a group — so rows stay newest-first inside a date bucket or a tier alike.
    let sections: Section[];
    if (sortMode === "opportunity") {
      const byTier = new Map<InterviewFit, PostingRowData[]>();
      for (const p of filtered) {
        const list = byTier.get(p.interviewFit);
        if (list) list.push(p);
        else byTier.set(p.interviewFit, [p]);
      }
      sections = TIER_ORDER.filter((t) => byTier.has(t)).map((t) => ({
        key: t,
        label: fitLabel(t),
        fit: t,
        rows: byTier.get(t)!,
      }));
    } else {
      const byBucket = new Map<DateBucket, PostingRowData[]>();
      for (const p of filtered) {
        const bucket = assignBucket(p.postedTs, now);
        const list = byBucket.get(bucket);
        if (list) list.push(p);
        else byBucket.set(bucket, [p]);
      }
      sections = BUCKET_ORDER.filter((b) => byBucket.has(b)).map((b) => ({
        key: b,
        label: BUCKET_LABELS[b],
        rows: byBucket.get(b)!,
      }));
    }

    const newCount = filtered.reduce((total, p) => total + (newIds.has(p.id) ? 1 : 0), 0);

    return { sections, shownCount: filtered.length, newCount, dateCounts, tierCounts };
  }, [postings, showHidden, now, dateFilter, tierFilter, sortMode, query, newIds]);

  const dateOptions: SegmentedOption<DateFilter>[] = [
    { value: "all", label: "All", count: dateCounts.all },
    ...BUCKET_ORDER.filter((b) => dateCounts[b] > 0).map((b) => ({
      value: b,
      label: BUCKET_CHIP_LABELS[b],
      count: dateCounts[b],
    })),
  ];

  const tierOptions: SegmentedOption<TierFilter>[] = [
    { value: "all", label: "All", count: tierCounts.all },
    ...TIER_ORDER.filter((t) => tierCounts[t] > 0).map((t) => ({
      value: t,
      label: fitLabel(t),
      count: tierCounts[t],
    })),
  ];

  const filtersActive = dateFilter !== "all" || tierFilter !== "all" || query.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SegmentedControl
            aria-label="Filter by date posted"
            options={dateOptions}
            value={dateFilter}
            onValueChange={setDateFilter}
          />
          <div className="relative w-full sm:w-64">
            <Input
              type="search"
              placeholder="Search company or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search postings"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute inset-y-0 right-2 my-auto flex h-4 w-4 items-center justify-center rounded-full text-xs leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs text-muted-foreground">Opportunity</span>
          <SegmentedControl
            aria-label="Filter by opportunity tier"
            options={tierOptions}
            value={tierFilter}
            onValueChange={setTierFilter}
          />
          <span className="text-xs text-muted-foreground sm:ml-2">Sort</span>
          <SegmentedControl
            aria-label="Sort postings"
            options={SORT_OPTIONS}
            value={sortMode}
            onValueChange={setSortMode}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtersActive ? (
          <>
            {shownCount} {shownCount === 1 ? "posting" : "postings"} match
            {" · "}
            <button
              type="button"
              onClick={() => {
                setDateFilter("all");
                setTierFilter("all");
                setSearch("");
              }}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Clear filters
            </button>
          </>
        ) : (
          <>
            Showing {shownCount} of {totalActiveCount} active postings that match your target
            companies &amp; roles.
          </>
        )}
        {newCount > 0 && (
          <>
            {" · "}
            <span className="font-medium text-foreground">
              {newCount} new since your last visit
            </span>
          </>
        )}
        {/* Kept out of `filtersActive` on purpose: revealing hidden postings is a separate mode
            from the filters, and "Clear filters" should not silently turn it off. */}
        {(hiddenCount > 0 || showHidden) && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              aria-pressed={showHidden}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {showHidden
                ? `Hide ${hiddenCount} hidden`
                : `Show ${hiddenCount} hidden`}
            </button>
          </>
        )}
      </p>

      {shownCount === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {!filtersActive && !showHidden && hiddenCount > 0 ? (
            <>
              You&apos;ve hidden all {hiddenCount} matching{" "}
              {hiddenCount === 1 ? "posting" : "postings"}.{" "}
              <button
                type="button"
                onClick={() => setShowHidden(true)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Show hidden
              </button>
            </>
          ) : (
            <>
              No postings match these filters.{" "}
              <button
                type="button"
                onClick={() => {
                  setDateFilter("all");
                  setTierFilter("all");
                  setSearch("");
                }}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div>
          <PostingListHeader />
          <div
            key={`${dateFilter}-${tierFilter}-${sortMode}-${query}`}
            className="animate-in fade-in duration-200"
          >
            {sections.map((section) => (
              <section key={section.key}>
                <h2 className="mt-6 mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:mt-2">
                  {section.fit ? <FitBadge fit={section.fit} className="normal-case" /> : section.label}
                  <span className="tabular-nums font-normal text-muted-foreground/70">
                    {section.rows.length}
                  </span>
                </h2>
                {section.rows.map((posting) => (
                  <PostingRow
                    key={posting.id}
                    posting={posting}
                    isNew={newIds.has(posting.id)}
                  />
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
