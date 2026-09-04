import { Badge } from "@/components/ui/badge";
import { MarkAppliedButton } from "@/components/mark-applied-button";
import { HidePostingButton } from "@/components/hide-posting-button";
import { RelativeTime } from "@/components/relative-time";
import { FitBadge, NewMarker, fitRowClassName } from "@/components/fit-badge";
import { cn } from "@/lib/utils";
import type { PostingRowData } from "@/types/database";

/** Shared column template — the sticky header strip and every row use the same track sizes so
 * they line up. Below `sm` the row ignores this and stacks (see `PostingRow`).
 *
 * The header and each row are *separate* grid containers that only share this string, so every
 * track has to be intrinsically sized the same in both. The last track is therefore a fixed width
 * rather than `auto`: `auto` sized itself to the header label in one grid and to the row's action
 * buttons in the other, and `minmax(0,1fr)` on Title silently absorbed the ~60px difference —
 * which pushed the Location/Pay/Posted labels out of line with their own columns. */
export const ROW_GRID =
  "sm:grid sm:grid-cols-[7rem_9rem_minmax(0,1fr)_9rem_6rem_6.5rem_9.5rem] sm:items-center sm:gap-x-3";

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
    </div>
  );
}

export function PostingRow({
  posting,
  isNew = false,
}: {
  posting: PostingRowData;
  /** This posting wasn't on the site last visit — see `useNewPostingIds`. */
  isNew?: boolean;
}) {
  const iso = new Date(posting.postedTs).toISOString();

  return (
    <div
      className={cn(
        ROW_GRID,
        "flex flex-col gap-1.5 border-b border-border/60 py-3 transition-colors hover:bg-muted/40 sm:gap-y-0 sm:py-2",
        fitRowClassName(posting.interviewFit),
        // Revealed only via "Show hidden" — dimmed so it reads as set aside, not as a live row.
        posting.hidden && "opacity-55 hover:opacity-100"
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

      {/* `min-w-0` so the title keeps truncating once the marker shares its grid cell. */}
      <div className="flex min-w-0 items-center gap-1.5">
        {isNew && <NewMarker fit={posting.interviewFit} />}
        <a
          href={posting.url}
          target="_blank"
          rel="noopener noreferrer"
          title={posting.title}
          className="truncate text-sm font-medium underline-offset-4 hover:underline"
        >
          {posting.title}
        </a>
      </div>

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

      <div className="mt-1 flex items-center gap-1 sm:mt-0 sm:justify-self-end">
        <HidePostingButton
          postingId={posting.id}
          hidden={posting.hidden}
          label={`${posting.company} — ${posting.title}`}
        />
        <MarkAppliedButton postingId={posting.id} />
      </div>
    </div>
  );
}
