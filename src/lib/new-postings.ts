/** "New since your last visit" — the set of postings that weren't on the site last time.
 *
 * Deliberately an id-set diff rather than a `first_seen_at > lastVisitedAt` timestamp check. A
 * posting can land on the Postings tab long after it was ingested: its company gets added to
 * `target-companies.json` (which the hourly check does routinely), an application row that was
 * hiding it is deleted, or it's unhidden. All three are genuinely "not there last time I
 * looked" while carrying a `first_seen_at` from weeks ago, and a timestamp comparison would
 * silently miss every one of them.
 *
 * Both halves are pure so they can be tested without a DOM; the storage reads/writes live in
 * `src/components/use-new-postings.ts`. */

/** Committed across visits: every posting id the explorer rendered last time. */
export const SEEN_POSTINGS_KEY = "apptrack:seen-posting-ids";

/** Per-tab, per-session: the answer computed on this session's first load. Keeps the marks
 * stable across a refresh — otherwise reloading the page would immediately re-diff against the
 * set the first load just committed and clear every mark. */
export const NEW_POSTINGS_SESSION_KEY = "apptrack:new-posting-ids";

/** Tolerant parse of a stored id list. Returns null for "nothing stored" *and* for anything
 * unreadable, which callers treat identically: suppress the marks for one visit rather than
 * risk lighting up the whole feed off a corrupt value. */
export function parseIdList(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return null;
  }
}

/** Ids in `currentIds` that aren't in `seenIds`, in the order they were given.
 *
 * A null `seenIds` means there's no previous visit on record — a first-ever load, or storage
 * that couldn't be read. That returns nothing rather than everything: marking all ~1200 rows
 * new on first use is noise, not a signal. */
export function diffNewPostingIds(
  currentIds: readonly string[],
  seenIds: readonly string[] | null
): string[] {
  if (seenIds === null) return [];
  const seen = new Set(seenIds);
  return currentIds.filter((id) => !seen.has(id));
}
