import { cn } from "@/lib/utils";
import type { InterviewFit } from "@/types/database";

/** Each tier gets its own hue so the three-way read (ready / target / reach) is legible at a
 * glance rather than by reading the label — grey-on-grey dots made Target and Reach near-
 * indistinguishable while scanning. Kept as tinted outlines rather than solid fills so a long
 * list doesn't turn into a colour chart.
 *
 * Its own module (rather than living in posting-row.tsx) so the Applications table can show the
 * same tier without pulling the posting row — and its "Mark applied" button — into that bundle. */
const FIT_DISPLAY: Record<
  InterviewFit,
  { label: string; dotClassName: string; pillClassName: string; rowClassName: string }
> = {
  ready_now: {
    label: "Ready now",
    dotClassName: "bg-emerald-500",
    pillClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    rowClassName: "bg-emerald-500/[0.04]",
  },
  target: {
    label: "Target",
    dotClassName: "bg-sky-500",
    pillClassName: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    rowClassName: "",
  },
  reach: {
    label: "Reach",
    dotClassName: "bg-amber-500",
    pillClassName: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    rowClassName: "",
  },
  // "Unrated" isn't a negative signal, just "not researched yet" — dashed and uncoloured so it
  // reads as absent information rather than as a fourth ranking below Reach.
  unrated: {
    label: "Unrated",
    dotClassName: "border border-dashed border-muted-foreground/50",
    pillClassName: "border-dashed border-muted-foreground/30 text-muted-foreground/70",
    rowClassName: "",
  },
};

/** Best-first. The order tier sections, filter chips and tier sorts all follow. */
export const TIER_ORDER: InterviewFit[] = ["ready_now", "target", "reach", "unrated"];

export function fitLabel(fit: InterviewFit): string {
  return FIT_DISPLAY[fit].label;
}

/** Row-level background tint, applied only to Ready now so it stands out in a long list. */
export function fitRowClassName(fit: InterviewFit): string {
  return FIT_DISPLAY[fit].rowClassName;
}

/** The "Opportunity" signal for a row: a tinted pill carrying the tier. Also used as a section
 * heading marker when a list is grouped by opportunity. */
export function FitBadge({ fit, className }: { fit: InterviewFit; className?: string }) {
  const display = FIT_DISPLAY[fit];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] leading-none font-medium whitespace-nowrap",
        display.pillClassName,
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", display.dotClassName)} />
      {display.label}
    </span>
  );
}
