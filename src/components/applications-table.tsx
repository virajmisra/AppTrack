"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FitBadge, TIER_ORDER } from "@/components/fit-badge";
import { StatusSelect } from "@/components/status-select";
import { formatDate } from "@/lib/format";
import type { ApplicationRowData, ApplicationSource } from "@/types/database";

const SOURCE_LABEL: Record<ApplicationSource, string> = {
  feed: "Feed",
  manual: "Manual",
  email: "Auto",
};

/** "pipeline" keeps the server's ordering (live rows above dead ones, rejected last);
 * "opportunity" regroups by company tier, best-first, preserving pipeline order inside a tier. */
type SortMode = "pipeline" | "opportunity";

const SORT_OPTIONS: SegmentedOption<SortMode>[] = [
  { value: "pipeline", label: "Pipeline" },
  { value: "opportunity", label: "Opportunity" },
];

const TIER_RANK = new Map(TIER_ORDER.map((tier, i) => [tier, i]));

export function ApplicationsTable({ rows }: { rows: ApplicationRowData[] }) {
  const [sortMode, setSortMode] = useState<SortMode>("pipeline");

  const sorted = useMemo(() => {
    if (sortMode === "pipeline") return rows;
    // `rows` arrives pipeline-sorted from the server, and Array.prototype.sort is stable, so
    // ranking on tier alone yields tier-then-pipeline without restating the pipeline comparator.
    return [...rows].sort(
      (a, b) => TIER_RANK.get(a.interviewFit)! - TIER_RANK.get(b.interviewFit)!
    );
  }, [rows, sortMode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs text-muted-foreground">Sort</span>
        <SegmentedControl
          aria-label="Sort applications"
          options={SORT_OPTIONS}
          value={sortMode}
          onValueChange={setSortMode}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Opportunity</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((application) => (
            <TableRow key={application.id}>
              <TableCell>
                <FitBadge fit={application.interviewFit} />
              </TableCell>
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
                {SOURCE_LABEL[application.source] ?? (application.posting_id ? "Feed" : "Manual")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
