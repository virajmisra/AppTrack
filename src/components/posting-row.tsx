import { Badge } from "@/components/ui/badge";
import { PostingActions } from "@/components/posting-actions";
import { RelativeTime } from "@/components/relative-time";
import { FitBadge, NewMarker, fitRowClassName } from "@/components/fit-badge";
import { cn } from "@/lib/utils";
import type { PostingRowData } from "@/types/database";

/** Shared column template — the sticky header strip and every row use the same track sizes so
 * they line up. Below `sm` the row ignores this and stacks (see `PostingRow`).
 *
 * The last track is a fixed width rather than `auto` on purpose: the header and the rows are two
 * separate grid containers that only share this string, so an `auto` track sized itself to each
 * container's own content — the word "Application" in the header, the buttons in a row — and the
 * flexible title column absorbed the difference, leaving every column right of Title misaligned
 * between the header and the rows it labels. A fixed track makes both grids resolve identically. */
export const ROW_GRID =
  "sm:grid sm:grid-cols-[7rem_9rem_minmax(0,1fr)_9rem_6rem_6.5rem_5.5rem] sm:items-center sm:gap-x-3";

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
      <span className="justify-self-end">Application</span>
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
        // `opacity` on the row creates a compositing group, so the action buttons can't opt out of
        // it; 70% (rather than 55%) is what keeps the icon-only restore arrow findable at rest.
        // `focus-within` matters because `hover` is pointer-only — without it a keyboard user lands
        // on the restore button while the row is still dimmed.
        posting.hidden && "opacity-70 hover:opacity-100 focus-within:opacity-100"
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

      <PostingActions
        postingId={posting.id}
        hidden={posting.hidden}
        label={`${posting.company} — ${posting.title}`}
      />
    </div>
  );
}
