/** Shared date/time formatting. Pure — no `server-only` / `"use client"`, so both the RSC and
 * client trees import the same copy. (Previously duplicated across page.tsx,
 * applications/page.tsx, detected-applications.tsx and last-synced.tsx.) */

const ABSOLUTE_FALLBACK_MS = 14 * 24 * 60 * 60 * 1000; // past ~2 weeks, show the date instead

/** "Aug 28, 2026". `null`/unparseable → "—". */
export function formatDate(value: string | null): string {
  if (!value) return "—";
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "just now" / "5m ago" / "3h ago" / "2d ago", then falls back to an absolute date once the
 * value is more than ~2 weeks old (relative distances stop being useful past that). `null` →
 * "never"; unparseable → "—". */
export function formatRelativeTime(value: string | null): string {
  if (!value) return "never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";

  const diffMs = Date.now() - then;
  if (diffMs >= ABSOLUTE_FALLBACK_MS) return formatDate(value);

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
