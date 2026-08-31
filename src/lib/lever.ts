import "server-only";
import type { LeverSource } from "./sources";
import type { NormalizedPosting } from "./postings";
import { titleMatchesFilters } from "./keyword-filter";
import { extractPayRange } from "./greenhouse";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string;
  };
  descriptionPlain?: string;
  description?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
}

export async function fetchLeverPostings(source: LeverSource): Promise<NormalizedPosting[]> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(source.boardToken)}?mode=json`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(
      `Lever fetch failed for board "${source.boardToken}" (${source.name}): ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as LeverPosting[];

  return data
    .filter((job) => titleMatchesFilters(job.text, source.requireAllGroups, source.excludeAny))
    .map((job) => ({
      source: "lever" as const,
      company: source.name,
      external_id: job.id,
      title: job.text,
      location: job.categories?.location ?? null,
      department: job.categories?.team ?? job.categories?.department ?? null,
      url: job.hostedUrl,
      posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      pay_range_text: extractPayRange(job.description),
      raw: job,
    }));
}
