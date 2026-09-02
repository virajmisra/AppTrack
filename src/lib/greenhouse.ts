import "server-only";
import type { GreenhouseSource } from "./sources";
import type { NormalizedPosting } from "./postings";
import { titleMatchesFilters } from "./keyword-filter";
import { extractPayRange } from "./pay";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  first_published: string | null;
  location: { name: string } | null;
  departments?: { name: string }[];
  content?: string;
}

interface GreenhouseBoardResponse {
  jobs: GreenhouseJob[];
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeHtmlEntitiesOnce(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function stripHtml(html: string): string {
  // Some Greenhouse boards (e.g. Figma) serve `content` double entity-encoded, so tags read as
  // "&lt;span&gt;" rather than "<span>" — decode twice to unwind that before stripping tags.
  let text = decodeHtmlEntitiesOnce(html);
  text = decodeHtmlEntitiesOnce(text);
  text = text.replace(/<[^>]*>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

export async function fetchGreenhouseJobs(source: GreenhouseSource): Promise<NormalizedPosting[]> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.boardToken)}/jobs?content=true`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(
      `Greenhouse fetch failed for board "${source.boardToken}" (${source.name}): ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as GreenhouseBoardResponse;

  return data.jobs
    .filter((job) => titleMatchesFilters(job.title, source.requireAllGroups, source.excludeAny))
    .map((job) => ({
      source: "greenhouse" as const,
      company: source.name,
      external_id: String(job.id),
      title: job.title,
      location: job.location?.name ?? null,
      department: job.departments?.[0]?.name ?? null,
      url: job.absolute_url,
      posted_at: job.first_published ?? job.updated_at ?? null,
      pay_range_text: job.content ? extractPayRange(stripHtml(job.content)) : null,
      raw: job,
    }));
}
