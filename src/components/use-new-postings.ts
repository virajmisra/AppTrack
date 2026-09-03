"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  diffNewPostingIds,
  parseIdList,
  NEW_POSTINGS_SESSION_KEY,
  SEEN_POSTINGS_KEY,
} from "@/lib/new-postings";

const NONE: ReadonlySet<string> = new Set();

/** Module-level rather than per-component: which postings are new is a property of this browsing
 * session, not of any one mount. Keeping it here means the marks survive a re-render, a
 * client-side nav to Applications and back, and a server-action revalidate — the visit is
 * recorded exactly once, by whichever mount gets there first. */
let snapshot: ReadonlySet<string> = NONE;
let visitRecorded = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
/** The server has no storage to read, so it renders no marks; the first client render matches,
 * and the real set arrives a tick later. Same hydration-safe shape as `relative-time.tsx`. */
const getServerSnapshot = () => NONE;

/** Diffs this visit against the last one and commits it, once per page session. */
function recordVisit(postings: readonly { id: string }[]): void {
  if (visitRecorded) return;
  visitRecorded = true;

  const currentIds = postings.map((posting) => posting.id);
  try {
    const carried = parseIdList(window.sessionStorage.getItem(NEW_POSTINGS_SESSION_KEY));
    if (carried) {
      // A refresh within the same tab: reuse the answer this session already computed instead
      // of re-diffing against the set that first load just committed, which would find nothing.
      snapshot = new Set(carried);
    } else {
      const fresh = diffNewPostingIds(
        currentIds,
        parseIdList(window.localStorage.getItem(SEEN_POSTINGS_KEY))
      );
      window.sessionStorage.setItem(NEW_POSTINGS_SESSION_KEY, JSON.stringify(fresh));
      snapshot = new Set(fresh);
    }
    // Hidden rows are committed too — they're part of what this browser has seen, so unhiding
    // one later shouldn't read as a posting that just appeared.
    window.localStorage.setItem(SEEN_POSTINGS_KEY, JSON.stringify(currentIds));
  } catch {
    // Private windows and blocked site data throw on access. No marks, nothing else breaks.
    snapshot = NONE;
  }

  for (const listener of listeners) listener();
}

/** Which of `postings` weren't on the site the last time this browser looked at it. */
export function useNewPostingIds(postings: readonly { id: string }[]): ReadonlySet<string> {
  const newIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    recordVisit(postings);
  }, [postings]);

  return newIds;
}
