"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { hidePosting, unhidePosting } from "@/app/actions";

/** "Not applying to this" — hides the posting from the feed without creating an application.
 * Same optimistic-free, transition-then-refresh shape as `MarkAppliedButton` so both buttons in
 * a row behave identically under a slow action. */
export function HidePostingButton({
  postingId,
  hidden,
  label,
}: {
  postingId: string;
  hidden: boolean;
  /** "{company} — {title}", so the repeated per-row buttons are distinguishable to a screen
   * reader rather than being a list of identical "Hide"s. */
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      await (hidden ? unhidePosting(postingId) : hidePosting(postingId));
      router.refresh();
    });

  return (
    <Button
      size="sm"
      variant={hidden ? "outline" : "ghost"}
      disabled={isPending}
      onClick={run}
      aria-label={`${hidden ? "Unhide" : "Hide"} ${label}`}
      title={hidden ? "Show this posting in the feed again" : "Hide — I'm not applying to this"}
      className={hidden ? undefined : "text-muted-foreground"}
    >
      {isPending ? "…" : hidden ? "Unhide" : "Hide"}
    </Button>
  );
}
