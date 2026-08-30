"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { PostingListHeader, PostingRow, fitLabel } from "@/components/posting-row";
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

const TIER_ORDER: InterviewFit[] = ["ready_now", "target", "reach", "unrated"];

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
  totalActiveCount,
  nowSeed,
}: {
  postings: PostingRowData[];
  totalActiveCount: number;
  /** Server's `Date.now()` at request time — the initial value keeps SSR and first client
   * render identical; a mount effect swaps in the real client clock. */
  nowSeed: number;
}) {
  const now = useBucketingNow(nowSeed);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();

  const { sections, shownCount, dateCounts, tierCounts } = useMemo(() => {
    const dateCounts: Record<DateFilter, number> = {
      all: postings.length,
      today: 0,
      yesterday: 0,
      past_week: 0,
      past_month: 0,
      older: 0,
    };
    const tierCounts: Record<TierFilter, number> = {
      all: postings.length,
      ready_now: 0,
      target: 0,
      reach: 0,
      unrated: 0,
    };
    for (const p of postings) {
      dateCounts[assignBucket(p.postedTs, now)] += 1;
      tierCounts[p.interviewFit] += 1;
    }

    const windowStart =
      dateFilter === "all" ? Number.NEGATIVE_INFINITY : bucketWindowStart(dateFilter, now);

    const filtered = postings.filter((p) => {
      if (p.postedTs < windowStart) return false;
      if (tierFilter !== "all" && p.interviewFit !== tierFilter) return false;
      if (query && !`${p.company} ${p.title}`.toLowerCase().includes(query)) return false;
      return true;
    });

    const grouped = new Map<DateBucket, PostingRowData[]>();
    for (const p of filtered) {
      const bucket = assignBucket(p.postedTs, now);
      const list = grouped.get(bucket);
      if (list) list.push(p);
      else grouped.set(bucket, [p]);
    }

    const sections = BUCKET_ORDER.filter((b) => grouped.has(b)).map((b) => ({
      bucket: b,
      label: BUCKET_LABELS[b],
      rows: grouped.get(b)!,
    }));

    return { sections, shownCount: filtered.length, dateCounts, tierCounts };
  }, [postings, now, dateFilter, tierFilter, query]);

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
      </p>

      {shownCount === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
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
        </div>
      ) : (
        <div>
          <PostingListHeader />
          <div
            key={`${dateFilter}-${tierFilter}-${query}`}
            className="animate-in fade-in duration-200"
          >
            {sections.map((section) => (
              <section key={section.bucket}>
                <h2 className="mt-6 mb-1 flex items-baseline gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:mt-2">
                  {section.label}
                  <span className="tabular-nums font-normal text-muted-foreground/70">
                    {section.rows.length}
                  </span>
                </h2>
                {section.rows.map((posting) => (
                  <PostingRow key={posting.id} posting={posting} />
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
