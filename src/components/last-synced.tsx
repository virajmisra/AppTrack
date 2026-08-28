"use client";

import { useSyncExternalStore } from "react";

function formatRelativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

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
