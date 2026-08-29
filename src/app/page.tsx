import { SyncButton } from "@/components/sync-button";
import { MarkAppliedButton } from "@/components/mark-applied-button";
import { LastSynced } from "@/components/last-synced";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { dedupePostings } from "@/lib/postings";
import { getLastSyncedAt, isSyncStale, runSync } from "@/lib/sync";
import { loadTargetCompanyNames } from "@/lib/target-companies";
import { postingFitsGoals } from "@/lib/posting-fit";
import { applicationMatchesPosting, type ApplicationLink } from "@/lib/application-match";
import { getInterviewFit, type InterviewFit } from "@/lib/company-tier";
import { cn } from "@/lib/utils";
import type { Posting } from "@/types/database";

const MAX_POSTING_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const INTERVIEW_FIT_DISPLAY: Record<
  InterviewFit,
  { label: string; badgeVariant: "default" | "secondary" | "outline"; rowAccentClassName: string }
> = {
  ready_now: {
    label: "Ready now",
    badgeVariant: "default",
    rowAccentClassName: "border-l-4 border-l-emerald-500 bg-emerald-500/5",
  },
  target: {
    label: "Target",
    badgeVariant: "secondary",
    rowAccentClassName: "border-l-4 border-l-muted-foreground/25",
  },
  reach: {
    label: "Reach",
    badgeVariant: "outline",
    rowAccentClassName: "border-l-4 border-l-transparent opacity-60",
  },
  // Not researched yet — deliberately no accent (neither emphasized nor faded), since "unrated"
  // isn't a signal that the posting is bad, just that its interview process hasn't been looked
  // into.
  unrated: {
    label: "Unrated",
    badgeVariant: "outline",
    rowAccentClassName: "border-l-4 border-l-transparent",
  },
};

interface LoadedPostings {
  postings: Posting[];
  totalActiveCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;
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
      .sort((a, b) => {
        const aTime = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const bTime = b.posted_at ? new Date(b.posted_at).getTime() : 0;
        return bTime - aTime;
      });

    return {
      postings: fitPostings,
      totalActiveCount: deduped.length,
      lastSyncedAt,
      syncError,
    };
  } catch (err) {
    return { setupError: err instanceof Error ? err.message : "Unknown setup error" };
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function Home() {
  const result = await loadActivePostings();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Postings</h1>
          <p className="text-sm text-muted-foreground">
            Software engineering internship postings, aggregated.
          </p>
          {!("setupError" in result) && (
            <p className="mt-1 text-xs text-muted-foreground">
              Showing {result.postings.length} of {result.totalActiveCount} active postings that match your
              target companies &amp; roles.
            </p>
          )}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Pay</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Application</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.postings.map((posting) => {
                  const interviewFit = getInterviewFit(posting.company);
                  const {
                    label: opportunityLabel,
                    badgeVariant,
                    rowAccentClassName,
                  } = INTERVIEW_FIT_DISPLAY[interviewFit];

                  return (
                    <TableRow key={posting.id} className={cn(rowAccentClassName)}>
                      <TableCell>
                        <Badge variant="secondary">{posting.company}</Badge>
                      </TableCell>
                      <TableCell className="max-w-sm truncate font-medium" title={posting.title}>
                        <a
                          href={posting.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-4 hover:text-foreground/80"
                        >
                          {posting.title}
                        </a>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground" title={posting.location ?? undefined}>
                        {posting.location ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeVariant}>{opportunityLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {posting.pay_range_text ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(posting.posted_at)}
                      </TableCell>
                      <TableCell>
                        <MarkAppliedButton postingId={posting.id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
