"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markPostingApplied } from "@/app/applications/actions";

export function MarkAppliedButton({ postingId }: { postingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await markPostingApplied(postingId);
          router.refresh();
        })
      }
    >
      {isPending ? "Marking..." : "Mark applied"}
    </Button>
  );
}
