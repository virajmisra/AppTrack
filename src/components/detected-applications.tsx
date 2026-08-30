"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  confirmDetectedApplication,
  dismissDetectedApplication,
} from "@/app/applications/actions";
import { formatDate } from "@/lib/format";
import type { Application } from "@/types/database";

type DetectedRow = Pick<
  Application,
  "id" | "company" | "role_title" | "job_url" | "status" | "date_applied" | "notes"
>;

function DetectedItem({ row }: { row: DetectedRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{row.company}</Badge>
          {row.status !== "applied" && <Badge variant="outline">{row.status}</Badge>}
        </div>
        <p className="mt-1 truncate text-sm font-medium" title={row.role_title}>
          {row.job_url ? (
            <a
              href={row.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground/80"
            >
              {row.role_title}
            </a>
          ) : (
            row.role_title
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Detected {formatDate(row.date_applied)}
          {row.notes ? ` · ${row.notes.replace(/^Auto-detected from a confirmation email \(/, "").replace(/\)\.$/, "")}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => run(() => confirmDetectedApplication(row.id))}
        >
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => dismissDetectedApplication(row.id))}
        >
          Not me
        </Button>
      </div>
    </li>
  );
}

/** Review strip for email-detected applications the parser wasn't fully sure about. They already
 * hide their posting in the feed; confirming keeps them, "Not me" deletes the row and the posting
 * comes back. */
export function DetectedApplications({ rows }: { rows: DetectedRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">
          Detected from your email — confirm these are yours
        </h2>
        <span className="text-xs text-muted-foreground">{rows.length} to review</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Auto-added from application-confirmation emails, but the match wasn&apos;t certain. Each one
        is already hidden from the Postings feed.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <DetectedItem key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}
