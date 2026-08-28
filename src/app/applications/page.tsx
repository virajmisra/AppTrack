import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusSelect } from "@/components/status-select";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Application, ApplicationStatus } from "@/types/database";
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

async function loadApplications(): Promise<{ applications: Application[] } | { setupError: string }> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("applications").select("*");

    if (error) {
      return { setupError: `Query failed: ${error.message}` };
    }

    const applications = ((data ?? []) as Application[]).sort((a, b) => {
      const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.last_status_change_at).getTime() - new Date(a.last_status_change_at).getTime();
    });

    return { applications };
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

export default async function ApplicationsPage() {
  const result = await loadApplications();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Everything you&apos;ve applied to — from the postings feed or added manually.
        </p>
      </div>

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell>
                  <Badge variant="secondary">{application.company}</Badge>
                </TableCell>
                <TableCell className="max-w-sm truncate font-medium" title={application.role_title}>
                  {application.job_url ? (
                    <a
                      href={application.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4 hover:text-foreground/80"
                    >
                      {application.role_title}
                    </a>
                  ) : (
                    application.role_title
                  )}
                </TableCell>
                <TableCell>
                  <StatusSelect applicationId={application.id} status={application.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(application.date_applied)}
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {application.notes ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {application.posting_id ? "Feed" : "Manual"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
