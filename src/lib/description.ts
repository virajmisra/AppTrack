import "server-only";
import { stripHtml } from "./greenhouse";

const FETCH_TIMEOUT_MS = 6_000;
const MAX_TEXT_LENGTH = 20_000;

/** Greenhouse postings already carry their full description in raw.content (see greenhouse.ts) — no network call needed. */
export function extractDescriptionFromRawContent(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || !("content" in raw)) return null;
  const content = (raw as { content?: unknown }).content;
  if (typeof content !== "string" || !content.trim()) return null;
  return stripHtml(content).slice(0, MAX_TEXT_LENGTH);
}

/** Lever postings (see lever.ts) also carry the full description in `raw` — no network call
 * needed. The requirements/clearance/degree language `eligibility.ts` keys on lives in the
 * `lists[].content` blocks, not the intro `descriptionPlain`, so all of it is concatenated. */
export function extractDescriptionFromLeverRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const job = raw as {
    descriptionPlain?: unknown;
    additionalPlain?: unknown;
    lists?: unknown;
  };

  const parts: string[] = [];
  if (typeof job.descriptionPlain === "string") parts.push(job.descriptionPlain);
  if (Array.isArray(job.lists)) {
    for (const list of job.lists) {
      if (list && typeof list === "object" && typeof (list as { content?: unknown }).content === "string") {
        parts.push((list as { content: string }).content);
      }
    }
  }
  if (typeof job.additionalPlain === "string") parts.push(job.additionalPlain);

  const combined = parts.join("\n").trim();
  if (!combined) return null;
  return stripHtml(combined).slice(0, MAX_TEXT_LENGTH);
}

/** Best-effort text fetch for GitHub-feed postings, which only carry a URL. Plain server-side
 * fetch — this is text extraction, not interactive form-filling, so the cross-origin-iframe
 * limitations hit during application staging don't apply here. Returns null on any failure,
 * including pages that render their description client-side via JS (the fetched HTML shell
 * won't contain it) — callers must treat null as "unverifiable", not "ineligible". */
export async function fetchDescriptionText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AppTrack/1.0)" },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const text = stripHtml(html);
    return text.length > 0 ? text.slice(0, MAX_TEXT_LENGTH) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
