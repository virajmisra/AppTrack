import "server-only";
import type { GithubFeedSource } from "./sources";
import type { NormalizedPosting } from "./postings";
import { normalizeUrl } from "./postings";
import { titleMatchesFilters } from "./keyword-filter";
import { isFutureOrCurrentTerm } from "./terms";

interface SimplifyEntry {
  id: string;
  company_name: string;
  title: string;
  category: string;
  terms?: string[];
  active: boolean;
  url: string;
  locations?: string[];
  date_posted?: number;
}

interface VanshEntry {
  id: string;
  company_name: string;
  title: string;
  season?: string | null;
  active: boolean;
  url: string;
  locations?: string[];
  date_posted?: number;
}

function toPostedAt(dateSeconds: number | undefined): string | null {
  if (!dateSeconds) return null;
  return new Date(dateSeconds * 1000).toISOString();
}

function normalizeEntry(
  entry: { company_name: string; title: string; url: string; locations?: string[]; date_posted?: number },
  raw: unknown
): NormalizedPosting {
  return {
    source: "github-feed",
    company: entry.company_name,
    external_id: normalizeUrl(entry.url),
    title: entry.title,
    location: entry.locations?.join(", ") ?? null,
    department: null,
    url: entry.url,
    posted_at: toPostedAt(entry.date_posted),
    pay_range_text: null,
    raw,
  };
}

function passesCategorizedFilters(entry: SimplifyEntry, categories: string[], excludeAny: string[]): boolean {
  if (!entry.active) return false;

  const allowed = categories.some((c) => c.toLowerCase() === entry.category?.toLowerCase());
  if (!allowed) return false;

  if (!titleMatchesFilters(entry.title, [], excludeAny)) return false;

  const terms = entry.terms ?? [];
  const meaningfulTerms = terms.filter((t) => t.toUpperCase() !== "N/A");
  if (meaningfulTerms.length === 0) return true;

  return meaningfulTerms.some((t) => isFutureOrCurrentTerm(t));
}

function passesKeywordFilters(entry: VanshEntry, requireAllGroups: string[][], excludeAny: string[]): boolean {
  if (!entry.active) return false;
  return titleMatchesFilters(entry.title, requireAllGroups, excludeAny);
}

export async function fetchGithubFeedPostings(source: GithubFeedSource): Promise<NormalizedPosting[]> {
  const res = await fetch(source.url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`GitHub feed fetch failed for "${source.name}": ${res.status} ${res.statusText}`);
  }

  if (source.schema === "categorized") {
    const entries = (await res.json()) as SimplifyEntry[];
    return entries
      .filter((entry) => passesCategorizedFilters(entry, source.categories, source.excludeAny))
      .map((entry) => normalizeEntry(entry, entry));
  }

  const entries = (await res.json()) as VanshEntry[];
  return entries
    .filter((entry) => passesKeywordFilters(entry, source.requireAllGroups, source.excludeAny))
    .map((entry) => normalizeEntry(entry, entry));
}
