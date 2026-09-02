import { SyncButton } from "@/components/sync-button";
import { LastSynced } from "@/components/last-synced";
import { PostingsExplorer } from "@/components/postings-explorer";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { dedupePostings } from "@/lib/postings";
import { getLastSyncedAt, isSyncStale, runSync } from "@/lib/sync";
import { loadTargetCompanyNames } from "@/lib/target-companies";
import { postingFitsGoals } from "@/lib/posting-fit";
import { applicationMatchesPosting, type ApplicationLink } from "@/lib/application-match";
import { getInterviewFit } from "@/lib/company-tier";
import type { Posting, PostingRowData } from "@/types/database";

const MAX_POSTING_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface LoadedPostings {
  postings: PostingRowData[];
  /** How many of `postings` the user has hidden — drives the "N hidden" toggle. */
  hiddenCount: number;
  totalActiveCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  /** Server clock at load time — seeds the client explorer's date bucketing so SSR and the
   * first client render agree before the browser's own clock takes over. */
  nowSeed: number;
}

/** Auto-refreshes postings from sources when the last sync is older than the staleness
 * threshold, so the feed doesn't silently go stale just because nobody clicked "Sync now". */
async function ensureFreshData(): Promise<{ lastSyncedAt: string | null; syncError: string | null }> {
  const lastSyncedAt = await getLastSyncedAt();
  if (!isSyncStale(lastSyncedAt)) {
    return { lastSyncedAt, syncError: null };
  }

  try {
    const summary = await runSync();
    return { lastSyncedAt: summary.synced_at, syncError: null };
  } catch (err) {
    // Don't let a broken source (e.g. one Greenhouse board 404ing) take down the whole
    // dashboard — fall back to whatever was last synced and surface the error instead.
    return { lastSyncedAt, syncError: err instanceof Error ? err.message : "Auto-sync failed" };
  }
}

/** Projects a full `Posting` down to the slim, serializable shape the client explorer needs.
 * The interview-fit tier is resolved here so `company-tier.ts` stays server-side. */
function toRowData(posting: Posting): PostingRowData {
  const posted = posting.posted_at ?? posting.first_seen_at;
  return {
    id: posting.id,
    company: posting.company,
    title: posting.title,
    url: posting.url,
    location: posting.location,
    payRangeText: posting.pay_range_text,
    postedTs: new Date(posted).getTime(),
    approximate: posting.posted_at == null,
    interviewFit: getInterviewFit(posting.company),
    hidden: posting.hidden_at != null,
  };
}

async function loadActivePostings(): Promise<LoadedPostings | { setupError: string }> {
  try {
    const { lastSyncedAt, syncError } = await ensureFreshData();

    const supabase = getSupabaseServerClient();
    const [postingsRes, applicationsRes, targetCompanyNames] = await Promise.all([
      supabase
        .from("postings")
        .select("*")
        .eq("is_active", true)
        .eq("is_eligible", true)
        .order("posted_at", { ascending: false }),
      supabase.from("applications").select("posting_id, company, role_title, job_url"),
      loadTargetCompanyNames(),
    ]);

    if (postingsRes.error) {
      return {
        setupError: `Query failed: ${postingsRes.error.message}. Have you run the migrations in supabase/migrations?`,
      };
    }
    if (applicationsRes.error) {
      return { setupError: `Query failed: ${applicationsRes.error.message}` };
    }

    const applications = (applicationsRes.data ?? []) as ApplicationLink[];

    const now = Date.now();
    const deduped = dedupePostings((postingsRes.data ?? []) as Posting[]);
    const fitPostings = deduped
      .filter((posting) => postingFitsGoals(posting, targetCompanyNames))
      .filter((posting) => !applications.some((application) => applicationMatchesPosting(posting, application)))
      .filter((posting) => {
        // Applies to postings as they come out — a listing sitting around for a month+ isn't
        // worth seeing. Postings without a posted_at can't have their age verified, so they're
        // kept rather than penalized.
        if (!posting.posted_at) return true;
        return now - new Date(posting.posted_at).getTime() <= MAX_POSTING_AGE_MS;
      })
      .map(toRowData)
      .sort((a, b) => b.postedTs - a.postedTs);

    // Hidden postings are deliberately still in this array, carrying `hidden: true`. The explorer
    // filters them out of the default view and can reveal them without a refetch; counting them
    // here keeps the "N hidden" affordance honest.
    const hiddenCount = fitPostings.filter((posting) => posting.hidden).length;

    return {
      postings: fitPostings,
      hiddenCount,
      totalActiveCount: deduped.length,
      lastSyncedAt,
      syncError,
      nowSeed: now,
    };
  } catch (err) {
    return { setupError: err instanceof Error ? err.message : "Unknown setup error" };
  }
}

export default async function Home() {
  const result = await loadActivePostings();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Postings</h1>
          <p className="text-sm text-muted-foreground">
            Software engineering internship postings, aggregated.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <SyncButton />
          {!("setupError" in result) && <LastSynced lastSyncedAt={result.lastSyncedAt} />}
        </div>
      </div>

      {"setupError" in result ? (
        <div className="rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Setup needed</p>
          <p className="mt-1 text-muted-foreground">{result.setupError}</p>
        </div>
      ) : (
        <>
          {result.syncError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
              <p className="font-medium">Auto-sync failed, showing last known data</p>
              <p className="mt-1 text-muted-foreground">{result.syncError}</p>
            </div>
          )}
          {result.postings.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              {result.totalActiveCount === 0 ? (
                <>
                  No postings yet. Click &quot;Sync now&quot; to pull the latest from the configured
                  companies in sources.json.
                </>
              ) : (
                <>
                  {result.totalActiveCount} active postings synced, but none match your target companies
                  or technical-role filters. Edit <code>target-companies.json</code> to adjust the
                  allowlist.
                </>
              )}
            </div>
          ) : (
            <PostingsExplorer
              postings={result.postings}
              hiddenCount={result.hiddenCount}
              totalActiveCount={result.totalActiveCount}
              nowSeed={result.nowSeed}
            />
          )}
        </>
      )}
    </div>
  );
}
