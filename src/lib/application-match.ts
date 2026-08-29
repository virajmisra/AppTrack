import { normalizeCompanyName } from "./target-companies";
import { normalizeUrl } from "./postings";
import type { Application, Posting } from "@/types/database";

/** Words too generic to count as a signal when comparing a posting's title against a logged
 * application's role title (which is often paraphrased/truncated from a Gmail confirmation
 * rather than copied verbatim from the listing). */
const TITLE_NOISE_WORDS = new Set([
  "summer", "winter", "spring", "fall", "2025", "2026", "2027", "2028",
  "intern", "internship", "co", "op", "coop", "program", "the", "a", "an",
  "and", "or", "for", "in", "at", "of", "to",
]);

export function significantTitleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 0 && !TITLE_NOISE_WORDS.has(word))
  );
}

/** Fraction of the smaller title's significant words that also appear in the other title. */
export function titleOverlapRatio(a: string, b: string): number {
  const aWords = significantTitleWords(a);
  const bWords = significantTitleWords(b);
  if (aWords.size === 0 || bWords.size === 0) return 0;
  const shared = [...aWords].filter((word) => bWords.has(word)).length;
  return shared / Math.min(aWords.size, bWords.size);
}

/** How much title overlap counts as "the same role" for fuzzy company+title matching. */
export const TITLE_MATCH_THRESHOLD = 0.6;

export type ApplicationLink = Pick<
  Application,
  "posting_id" | "company" | "role_title" | "job_url"
>;

/** Whether an already-logged application refers to this posting. Feed- and email-sourced
 * applications carry an exact posting_id or job_url; manually-added ones often have neither — for
 * those, fall back to matching company plus significant overlap in the role title. Best-effort: a
 * generically-worded application (e.g. "role unspecified in confirmation email") may not match
 * anything, leaving that posting visible rather than risking hiding an unrelated one. */
export function applicationMatchesPosting(
  posting: Pick<Posting, "id" | "company" | "title" | "url">,
  application: ApplicationLink
): boolean {
  if (application.posting_id && application.posting_id === posting.id) return true;
  if (application.job_url && normalizeUrl(application.job_url) === normalizeUrl(posting.url)) {
    return true;
  }

  // An application already pinned to a specific posting (or exact URL) must not also fuzzy-match
  // that company's *other* postings — otherwise applying to e.g. "NVIDIA Software Engineering
  // Intern" would wrongly hide "NVIDIA Systems Software Engineering Intern" too, since the
  // title-overlap heuristic below can't tell near-identical sibling roles apart.
  if (application.posting_id || application.job_url) return false;

  if (normalizeCompanyName(application.company) !== normalizeCompanyName(posting.company)) {
    return false;
  }

  return titleOverlapRatio(posting.title, application.role_title) >= TITLE_MATCH_THRESHOLD;
}

/** Best-effort link from a parsed confirmation email to the posting it's about, so a detected
 * application can hide the exact posting (and only that one). Prefers an exact URL match, then
 * falls back to same-company + strong title overlap among the candidate postings. Returns null
 * when nothing is a confident match — a detection with no posting_id still hides its posting via
 * the company+title fallback in applicationMatchesPosting, it just isn't pinned. */
export function findMatchingPosting<
  P extends Pick<Posting, "id" | "company" | "title" | "url">
>(
  parsed: { company: string; roleTitle: string; jobUrl: string | null },
  postings: P[]
): P | null {
  if (parsed.jobUrl) {
    const normalized = normalizeUrl(parsed.jobUrl);
    const urlMatch = postings.find((p) => normalizeUrl(p.url) === normalized);
    if (urlMatch) return urlMatch;
  }

  const sameCompany = postings.filter(
    (p) => normalizeCompanyName(p.company) === normalizeCompanyName(parsed.company)
  );
  if (sameCompany.length === 0) return null;

  let best: P | null = null;
  let bestRatio = TITLE_MATCH_THRESHOLD;
  for (const posting of sameCompany) {
    const ratio = titleOverlapRatio(posting.title, parsed.roleTitle);
    if (ratio > bestRatio) {
      best = posting;
      bestRatio = ratio;
    }
  }
  return best;
}
