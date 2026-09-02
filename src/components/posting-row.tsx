import { Badge } from "@/components/ui/badge";
import { MarkAppliedButton } from "@/components/mark-applied-button";
import { RelativeTime } from "@/components/relative-time";
import { FitBadge, fitRowClassName } from "@/components/fit-badge";
import { cn } from "@/lib/utils";
import type { PostingRowData } from "@/types/database";

/** Shared column template — the sticky header strip and every row use the same track sizes so
 * they line up. Below `sm` the row ignores this and stacks (see `PostingRow`). */
export const ROW_GRID =
  "sm:grid sm:grid-cols-[7rem_9rem_minmax(0,1fr)_9rem_6rem_6.5rem_auto] sm:items-center sm:gap-x-3";

/** Desktop column-label strip. Sticks to the top of the viewport while the list scrolls — works
 * because the list is no longer wrapped in the `<Table>`'s `overflow-x-auto` container. */
export function PostingListHeader() {
  return (
    <div
      className={cn(
        ROW_GRID,
        "sticky top-0 z-10 hidden border-b border-border bg-background/90 py-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase backdrop-blur"
      )}
    >
      <span>Opportunity</span>
      <span>Company</span>
      <span>Title</span>
      <span>Location</span>
      <span>Pay</span>
      <span>Posted</span>
      <span className="justify-self-end pr-1">Application</span>
    </div>
  );
}

export function PostingRow({ posting }: { posting: PostingRowData }) {
  const iso = new Date(posting.postedTs).toISOString();

  return (
    <div
      className={cn(
        ROW_GRID,
        "flex flex-col gap-1.5 border-b border-border/60 py-3 transition-colors hover:bg-muted/40 sm:gap-y-0 sm:py-2",
        fitRowClassName(posting.interviewFit)
      )}
    >
      {/* Opportunity tier — its own grid cell on desktop */}
      <FitBadge fit={posting.interviewFit} className="hidden sm:inline-flex" />

      {/* mobile: company badge + tier + time on one line */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:contents">
        <Badge variant="secondary" className="max-w-[9rem] truncate sm:max-w-full">
          {posting.company}
        </Badge>
        <FitBadge fit={posting.interviewFit} className="sm:hidden" />
        <span className="sm:hidden">
          <RelativeTime iso={iso} approximate={posting.approximate} />
        </span>
      </div>

      <a
        href={posting.url}
        target="_blank"
        rel="noopener noreferrer"
        title={posting.title}
        className="truncate text-sm font-medium underline-offset-4 hover:underline"
      >
        {posting.title}
      </a>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground sm:contents">
        <span
          className="truncate sm:text-sm"
          title={posting.location ?? undefined}
        >
          {posting.location ?? "—"}
        </span>
        <span className="before:mr-2 before:content-['·'] sm:text-sm sm:before:content-none">
          {posting.payRangeText ?? "—"}
        </span>
      </div>

      {/* desktop-only posted column */}
      <span className="hidden sm:block">
        <RelativeTime iso={iso} approximate={posting.approximate} />
      </span>

      <div className="mt-1 sm:mt-0 sm:justify-self-end">
        <MarkAppliedButton postingId={posting.id} />
      </div>
    </div>
  );
}
