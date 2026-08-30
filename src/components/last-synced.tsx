"use client";

import { useSyncExternalStore } from "react";
import { formatRelativeTime } from "@/lib/format";

const noopSubscribe = () => () => {};

/** "Xm ago" depends on Date.now() at render time, which differs between the server-rendered HTML
 * and the client hydration pass — computing it directly would trigger a hydration mismatch
 * warning. useSyncExternalStore's getServerSnapshot lets the server render a stable placeholder
 * while the client renders the real value, which is exactly what it's designed for. */
export function LastSynced({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const relativeTime = useSyncExternalStore(
    noopSubscribe,
    () => (lastSyncedAt ? formatRelativeTime(lastSyncedAt) : "never"),
    () => "…"
  );

  return <p className="text-xs text-muted-foreground">Last synced: {relativeTime}</p>;
}
