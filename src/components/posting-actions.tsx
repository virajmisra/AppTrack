"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, LoaderCircleIcon, Undo2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markPostingApplied } from "@/app/applications/actions";
import { hidePosting, unhidePosting } from "@/app/actions";

/** The two ways a posting leaves the feed, as one control: ✓ "I applied" (writes an `applications`
 * row) and ✗ "I'm not applying" (stamps `postings.hidden_at`). They are deliberately adjacent and
 * icon-only — the pair reads as a single either/or decision about the row, and dropping the text
 * labels hands the reclaimed width back to the title column, which is the one that truncates.
 *
 * On a hidden row (revealed by the explorer's "Show hidden" toggle) the ✗ becomes a restore arrow
 * and the ✓ stays put, so a posting can be marked applied without being unhidden first.
 *
 * Each button owns its own `useTransition`: the two server actions are independent, so a slow hide
 * must not disable the checkmark. Neither is optimistic — both run the action, then `router.refresh()`,
 * because `hiddenCount` and the applied-row filtering are computed on the server in `page.tsx`. */
export function PostingActions({
  postingId,
  hidden,
  label,
}: {
  postingId: string;
  hidden: boolean;
  /** "{company} — {title}", so a screen reader moving through the list hears which row each
   * button belongs to instead of N identical "Mark applied"s. */
  label: string;
}) {
  const router = useRouter();
  const [applyPending, startApply] = useTransition();
  const [hidePending, startHide] = useTransition();

  return (
    <div className="mt-1 flex items-center gap-1 sm:mt-0 sm:justify-self-end">
      <Button
        size="icon-sm"
        variant="outline"
        disabled={applyPending}
        aria-busy={applyPending}
        aria-label={`Mark applied: ${label}`}
        title="Mark applied"
        // Emerald borrowed from `fit-badge.tsx`'s ready_now tokens, and only on hover: a green tick
        // resting on every row would fight the tier tint the ready_now rows already carry.
        className="hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
        onClick={() =>
          startApply(async () => {
            await markPostingApplied(postingId);
            router.refresh();
          })
        }
      >
        {applyPending ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        ) : (
          <CheckIcon className="size-3.5" />
        )}
      </Button>

      <Button
        size="icon-sm"
        variant={hidden ? "outline" : "ghost"}
        disabled={hidePending}
        aria-busy={hidePending}
        aria-label={`${hidden ? "Restore" : "Hide"}: ${label}`}
        // The X on its own suggests "delete permanently"; hiding is reversible, and this tooltip is
        // the only thing that says so.
        title={hidden ? "Show this posting in the feed again" : "Hide — I'm not applying to this"}
        className={hidden ? undefined : "text-muted-foreground"}
        onClick={() =>
          startHide(async () => {
            await (hidden ? unhidePosting(postingId) : hidePosting(postingId));
            router.refresh();
          })
        }
      >
        {hidePending ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        ) : hidden ? (
          <Undo2Icon className="size-3.5" />
        ) : (
          <XIcon className="size-3.5" />
        )}
      </Button>
    </div>
  );
}
