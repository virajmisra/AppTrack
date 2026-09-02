import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApplicationsTable } from "@/components/applications-table";
import { DetectedApplications } from "@/components/detected-applications";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getInterviewFit } from "@/lib/company-tier";
import type { Application, ApplicationRowData, ApplicationStatus } from "@/types/database";
import { createManualApplication } from "./actions";

// Groups rows by how far along the pipeline they are, so live/active ones surface above
// dead ones — rejected sinks to the bottom regardless of how recently it happened.
const STATUS_RANK: Record<ApplicationStatus, number> = {
  offer: 0,
  interview: 1,
  oa: 2,
  applied: 3,
  rejected: 4,
};

async function loadApplications(): Promise<
  { applications: ApplicationRowData[]; pendingDetections: Application[] } | { setupError: string }
> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("applications").select("*");

    if (error) {
      return { setupError: `Query failed: ${error.message}` };
    }

    const all = (data ?? []) as Application[];
    const sortByPipeline = (a: Application, b: Application) => {
      const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.last_status_change_at).getTime() - new Date(a.last_status_change_at).getTime();
    };

    const pendingDetections = all
      .filter((app) => app.review_state === "pending")
      .sort((a, b) => new Date(b.date_applied).getTime() - new Date(a.date_applied).getTime());
    // Resolve the company tier here, on the server, so `company-tier.ts` stays out of the
    // client bundle — the table island only ever sees the resolved string.
    const applications: ApplicationRowData[] = all
      .filter((app) => app.review_state !== "pending")
      .sort(sortByPipeline)
      .map((app) => ({ ...app, interviewFit: getInterviewFit(app.company) }));

    return { applications, pendingDetections };
  } catch (err) {
    return { setupError: err instanceof Error ? err.message : "Unknown setup error" };
  }
}

export default async function ApplicationsPage() {
  const result = await loadApplications();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Everything you&apos;ve applied to — from the postings feed, auto-detected from your
          email, or added manually.
        </p>
      </div>

      {!("setupError" in result) && result.pendingDetections.length > 0 && (
        <DetectedApplications rows={result.pendingDetections} />
      )}

      <form
        action={createManualApplication}
        className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company">Company</Label>
          <Input id="company" name="company" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role_title">Role title</Label>
          <Input id="role_title" name="role_title" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="job_url">Job URL</Label>
          <Input id="job_url" name="job_url" type="url" placeholder="https://…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date_applied">Date applied</Label>
          <Input id="date_applied" name="date_applied" type="date" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={1} />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Add application
          </Button>
        </div>
      </form>

      {"setupError" in result ? (
        <div className="rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Setup needed</p>
          <p className="mt-1 text-muted-foreground">{result.setupError}</p>
        </div>
      ) : result.applications.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No applications yet. Mark a posting as applied from the postings feed, or add one manually above.
        </div>
      ) : (
        <ApplicationsTable rows={result.applications} />
      )}
    </div>
  );
}
