import type { Posting } from "@/types/database";

export interface NormalizedPosting {
  source: "greenhouse" | "lever" | "github-feed";
  company: string;
  external_id: string;
  title: string;
  location: string | null;
  department: string | null;
  url: string;
  posted_at: string | null;
  pay_range_text: string | null;
  raw: unknown;
}

/** Strips query string, hash, and trailing slash so the same job listed under different tracking params/across sources collides. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    let normalized = parsed.toString();
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return url.trim();
  }
}

/** Keeps one row per normalized URL, preferring a direct-source (greenhouse/lever) row over an aggregator (github-feed) row. */
export function dedupePostings(postings: Posting[]): Posting[] {
  const bySourcePriority = (posting: Posting) => (posting.source === "github-feed" ? 1 : 0);

  const byUrl = new Map<string, Posting>();
  for (const posting of postings) {
    const key = normalizeUrl(posting.url);
    const existing = byUrl.get(key);
    if (!existing || bySourcePriority(posting) < bySourcePriority(existing)) {
      byUrl.set(key, posting);
    }
  }

  return [...byUrl.values()].sort((a, b) => {
    const aTime = a.posted_at ? new Date(a.posted_at).getTime() : 0;
    const bTime = b.posted_at ? new Date(b.posted_at).getTime() : 0;
    return bTime - aTime;
  });
}
