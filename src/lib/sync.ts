import "server-only";
import { loadSources } from "@/lib/sources";
import { fetchGreenhouseJobs } from "@/lib/greenhouse";
import { fetchLeverPostings } from "@/lib/lever";
import { fetchGithubFeedPostings } from "@/lib/github-feed";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { NormalizedPosting } from "@/lib/postings";
import {
  extractDescriptionFromLeverRaw,
  extractDescriptionFromRawContent,
  fetchDescriptionText,
} from "@/lib/description";
import { checkEligibility } from "@/lib/eligibility";
import { extractPayRange } from "./pay";

/** How long synced postings are trusted before the dashboard triggers a fresh sync on load. Adjust freely. */
export const STALE_SYNC_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

const LAST_SYNCED_AT_KEY = "last_synced_at";
const UPSERT_CHUNK_SIZE = 500;

/** Per-sync cap on eligibility checks — bounds how many external fetches (for github-feed
 * postings without a saved description) a single sync run can trigger. The ~1,700 postings
 * already active when this shipped backfill over several sync cycles rather than one slow run. */
const ELIGIBILITY_BATCH_SIZE = 200;
const ELIGIBILITY_CONCURRENCY = 10;

export interface SourceSyncResult {
  source: string;
  fetched: number;
  deactivated: number;
}

export interface SyncSummary {
  synced_at: string;
  results: SourceSyncResult[];
  eligibility: { checked: number; ineligible: number; payFound: number };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** A single upsert statement can't touch the same (source, company, external_id) row twice —
 * collapse same-key postings (e.g. one feed listing a job twice, or two feeds normalizing to
 * the same company + URL) before upserting. */
function dedupeByConflictKey(postings: NormalizedPosting[]): NormalizedPosting[] {
  const byKey = new Map<string, NormalizedPosting>();
  for (const posting of postings) {
    byKey.set(`${posting.source}::${posting.company}::${posting.external_id}`, posting);
  }
  return [...byKey.values()];
}

/** Deliberately omits `pay_range_text`: this upsert runs ON CONFLICT DO UPDATE on every sync, so
 * any column named here is overwritten every time. Pay is derived from the description during
 * enrichment, which the adapters can't see at fetch time, so listing it here would reset every
 * enriched value to the adapter's null on the next sync. `enrichEligibility` is its only writer. */
function toRow(posting: NormalizedPosting, syncStartedAt: string) {
  return {
    source: posting.source,
    company: posting.company,
    external_id: posting.external_id,
    title: posting.title,
    location: posting.location,
    department: posting.department,
    url: posting.url,
    posted_at: posting.posted_at,
    last_seen_at: syncStartedAt,
    is_active: true,
    raw: posting.raw,
  };
}

/** Best-effort eligibility enrichment: pulls a bounded batch of active postings that haven't
 * been checked yet, fetches/extracts each description, and records is_eligible. Runs after the
 * main sync and never throws — a partial or failed enrichment pass shouldn't fail a sync that
 * otherwise succeeded. */
async function enrichEligibility(): Promise<{ checked: number; ineligible: number; payFound: number }> {
  const supabase = getSupabaseServerClient();

  const { data: candidates, error: fetchError } = await supabase
    .from("postings")
    .select("id, source, url, raw")
    .eq("is_active", true)
    .is("eligibility_checked_at", null)
    .limit(ELIGIBILITY_BATCH_SIZE);

  if (fetchError || !candidates || candidates.length === 0) {
    return { checked: 0, ineligible: 0, payFound: 0 };
  }

  let ineligibleCount = 0;
  let payFoundCount = 0;
  const checkedAt = new Date().toISOString();

  for (const batch of chunk(candidates, ELIGIBILITY_CONCURRENCY)) {
    await Promise.all(
      batch.map(async (row: { id: string; source: string; url: string; raw: unknown }) => {
        try {
          const descriptionText =
            row.source === "greenhouse"
              ? extractDescriptionFromRawContent(row.raw)
              : row.source === "lever"
                ? extractDescriptionFromLeverRaw(row.raw)
                : await fetchDescriptionText(row.url);

          const { eligible, reason } = checkEligibility(descriptionText);
          if (!eligible) ineligibleCount++;

          // Pay comes from the same text, so it is read here rather than at fetch time. This is
          // the only place GitHub-feed postings — the overwhelming majority of the feed — can get
          // it at all: their feed entry carries a URL and nothing else, so `github-feed.ts` has no
          // description to read and sets `pay_range_text: null`. Only written when something was
          // found, so an adapter that already supplied pay is never blanked.
          const payRangeText = extractPayRange(descriptionText);
          if (payRangeText) payFoundCount++;

          await supabase
            .from("postings")
            .update({
              description_text: descriptionText,
              is_eligible: eligible,
              eligibility_checked_at: checkedAt,
              ...(payRangeText ? { pay_range_text: payRangeText } : {}),
            })
            .eq("id", row.id);

          if (!eligible) {
            console.log(`[eligibility] excluded posting ${row.id}: ${reason}`);
          }
        } catch {
          // Leave eligibility_checked_at unset so this row gets retried next sync rather than
          // silently marked as checked when the failure was ours (not a genuine unfetchable page).
        }
      })
    );
  }

  return { checked: candidates.length, ineligible: ineligibleCount, payFound: payFoundCount };
}

export async function getLastSyncedAt(): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_meta")
    .select("value")
    .eq("key", LAST_SYNCED_AT_KEY)
    .maybeSingle();

  if (error || !data) return null;
  return (data.value as { at: string }).at ?? null;
}

export function isSyncStale(lastSyncedAt: string | null, now: Date = new Date()): boolean {
  if (!lastSyncedAt) return true;
  return now.getTime() - new Date(lastSyncedAt).getTime() > STALE_SYNC_THRESHOLD_MS;
}

export async function runSync(): Promise<SyncSummary> {
  const sources = await loadSources();
  const supabase = getSupabaseServerClient();
  const results: SourceSyncResult[] = [];

  // Captured once, before any upserts: any active posting whose last_seen_at is still older
  // than this after the sync wasn't returned this run, so it's stale. Avoids building an
  // "external_id NOT IN (...)" list, which would blow past query-length limits for the
  // GitHub feeds (hundreds of long URLs).
  const syncStartedAt = new Date().toISOString();

  for (const source of sources.greenhouse) {
    const jobs = await fetchGreenhouseJobs(source);

    if (jobs.length > 0) {
      const { error: upsertError } = await supabase
        .from("postings")
        .upsert(
          jobs.map((job) => toRow(job, syncStartedAt)),
          { onConflict: "source,company,external_id" }
        );
      if (upsertError) {
        throw new Error(`Upsert failed for ${source.name}: ${upsertError.message}`);
      }
    }

    const { data: deactivated, error: deactivateError } = await supabase
      .from("postings")
      .update({ is_active: false })
      .eq("source", "greenhouse")
      .eq("company", source.name)
      .eq("is_active", true)
      .lt("last_seen_at", syncStartedAt)
      .select("id");

    if (deactivateError) {
      throw new Error(`Deactivation failed for ${source.name}: ${deactivateError.message}`);
    }

    results.push({ source: `greenhouse:${source.name}`, fetched: jobs.length, deactivated: deactivated?.length ?? 0 });
  }

  // Lever: same per-company shape as Greenhouse — a token-addressed board, upsert what came back,
  // then deactivate any source='lever' row for this company not refreshed this run.
  for (const source of sources.lever) {
    const jobs = await fetchLeverPostings(source);

    if (jobs.length > 0) {
      const { error: upsertError } = await supabase
        .from("postings")
        .upsert(
          jobs.map((job) => toRow(job, syncStartedAt)),
          { onConflict: "source,company,external_id" }
        );
      if (upsertError) {
        throw new Error(`Upsert failed for ${source.name}: ${upsertError.message}`);
      }
    }

    const { data: deactivated, error: deactivateError } = await supabase
      .from("postings")
      .update({ is_active: false })
      .eq("source", "lever")
      .eq("company", source.name)
      .eq("is_active", true)
      .lt("last_seen_at", syncStartedAt)
      .select("id");

    if (deactivateError) {
      throw new Error(`Deactivation failed for ${source.name}: ${deactivateError.message}`);
    }

    results.push({ source: `lever:${source.name}`, fetched: jobs.length, deactivated: deactivated?.length ?? 0 });
  }

  // GitHub feeds: companies are dynamic (thousands of them), so fetch+filter every configured
  // feed, upsert the combined set, then deactivate any source='github-feed' row not refreshed
  // in this run.
  const githubPostingsRaw: NormalizedPosting[] = [];
  for (const source of sources.githubFeeds) {
    const postings = await fetchGithubFeedPostings(source);
    githubPostingsRaw.push(...postings);
  }
  const githubPostings = dedupeByConflictKey(githubPostingsRaw);

  for (const batch of chunk(githubPostings, UPSERT_CHUNK_SIZE)) {
    const { error: upsertError } = await supabase
      .from("postings")
      .upsert(
        batch.map((posting) => toRow(posting, syncStartedAt)),
        { onConflict: "source,company,external_id" }
      );
    if (upsertError) {
      throw new Error(`Upsert failed for github-feed batch: ${upsertError.message}`);
    }
  }

  const { data: githubDeactivated, error: githubDeactivateError } = await supabase
    .from("postings")
    .update({ is_active: false })
    .eq("source", "github-feed")
    .eq("is_active", true)
    .lt("last_seen_at", syncStartedAt)
    .select("id");

  if (githubDeactivateError) {
    throw new Error(`Deactivation failed for github-feed: ${githubDeactivateError.message}`);
  }

  results.push({
    source: "github-feed",
    fetched: githubPostings.length,
    deactivated: githubDeactivated?.length ?? 0,
  });

  const { error: metaError } = await supabase
    .from("app_meta")
    .upsert({ key: LAST_SYNCED_AT_KEY, value: { at: syncStartedAt }, updated_at: syncStartedAt });
  if (metaError) {
    throw new Error(`Failed to record last_synced_at: ${metaError.message}`);
  }

  const eligibility = await enrichEligibility().catch(() => ({ checked: 0, ineligible: 0, payFound: 0 }));

  return { synced_at: syncStartedAt, results, eligibility };
}
