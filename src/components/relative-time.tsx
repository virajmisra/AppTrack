"use client";

import { useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate, formatRelativeTime } from "@/lib/format";

const noopSubscribe = () => () => {};

/** A relative-time chip ("3h ago"). The relative string depends on `Date.now()` at render time,
 * which differs between the server-rendered HTML and client hydration — `useSyncExternalStore`
 * lets the server emit a stable "…" placeholder while the client renders the real value, which
 * is exactly the hydration-mismatch escape hatch it's designed for.
 *
 * `approximate` is for postings with no real `posted_at`, where the timestamp is our
 * `first_seen_at` — shown as "seen 3h ago" in muted text so it doesn't read as authoritative. */
export function RelativeTime({
  iso,
  approximate = false,
  className,
}: {
  iso: string;
  approximate?: boolean;
  className?: string;
}) {
  const label = useSyncExternalStore(
    noopSubscribe,
    () => formatRelativeTime(iso),
    () => "…"
  );

  return (
    <Badge
      variant="outline"
      className={cn(
        "tabular-nums font-normal",
        approximate && "text-muted-foreground",
        className
      )}
      title={formatDate(iso)}
    >
      {approximate ? `seen ${label}` : label}
    </Badge>
  );
}
