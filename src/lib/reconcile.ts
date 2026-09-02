import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { jobIdentityKey } from "@/lib/postings";
import { normalizeCompanyName, loadCanonicalCompanyNames } from "@/lib/target-companies";
import {
  findMatchingPosting,
  titleOverlapRatio,
  TITLE_MATCH_THRESHOLD,
} from "@/lib/application-match";
import {
  parseConfirmationEmail,
  classificationToParsed,
  type RawEmail,
  type ParsedApplicationEmail,
} from "@/lib/application-emails";
import type { ApplicationStatus, Posting } from "@/types/database";

const RECONCILE_WATERMARK_KEY = "last_application_reconcile_at";

/** Resolve a company name read out of an email (which may be a spaceless ATS slug like
 * "analogdevices", a domain-titleized "Thehartford", or a clean "Northrop Grumman") to the
 * canonical spelling in target-companies.json. Falls back to the cleaned input when nothing
 * matches — the user's policy is to track every company, canonical or not. */
const despace = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every canonical company name keyed by its spaceless lowercase form, keeping both the
 * generic-word-stripped normalization ("the hartford" → "hartford") and the raw form
 * ("thehartford") so an ATS slug matches either way. Longest keys first, for prefix matching. */
function buildDespacedIndex(canonical: Map<string, string>): [string, string][] {
  const index = new Map<string, string>();
  for (const [normalized, name] of canonical) {
    index.set(despace(normalized), name);
    index.set(despace(name), name);
  }
  return [...index.entries()].sort((a, b) => b[0].length - a[0].length);
}

function resolveCompanyName(
  parsed: { company: string; companySlug: string | null },
  canonical: Map<string, string>,
  despacedIndex: [string, string][]
): string {
  const candidates = [parsed.company, parsed.companySlug].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const normalized = normalizeCompanyName(candidate);
    const exact = canonical.get(normalized);
    if (exact) return exact;

    const key = despace(candidate);
    if (key.length < 4) continue;
    for (const [indexKey, name] of despacedIndex) {
      // exact, or the emailed name is a prefix of the canonical one ("iberdrola" → "Iberdrola
      // Group"), or vice-versa ("thehartfordcompany" → "The Hartford"). Length floor avoids
      // "meta" matching "metabase".
      if (
        indexKey === key ||
        (indexKey.startsWith(key) && key.length >= 5) ||
        (key.startsWith(indexKey) && indexKey.length >= 5)
      ) {
        return name;
      }
    }
  }
  return parsed.company;
}

type ExistingApplication = {
  id: string;
  company: string;
  role_title: string;
  job_url: string | null;
  posting_id: string | null;
  source_ref: string | null;
};

type CandidatePosting = Pick<Posting, "id" | "company" | "title" | "url">;

export interface ReconcileRowResult {
  emailId: string;
  company: string;
  roleTitle: string;
  status: ApplicationStatus;
  outcome:
    | "inserted_confirmed"
    | "inserted_pending"
    | "skipped_duplicate_email"
    | "skipped_already_tracked"
    | "error";
  postingLinked: boolean;
  detail?: string;
}

export interface ReconcileSummary {
  received: number;
  parsed: number;
  insertedConfirmed: number;
  insertedPending: number;
  skippedDuplicateEmail: number;
  skippedAlreadyTracked: number;
  errors: number;
  watermark: string;
  rows: ReconcileRowResult[];
}

export async function getReconcileWatermark(): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("app_meta")
    .select("value")
    .eq("key", RECONCILE_WATERMARK_KEY)
    .maybeSingle();
  if (error || !data) return null;
  return (data.value as { at: string }).at ?? null;
}

async function setReconcileWatermark(at: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase
    .from("app_meta")
    .upsert({ key: RECONCILE_WATERMARK_KEY, value: { at }, updated_at: new Date().toISOString() });
}

/** True if this parsed email is already represented by an application row — same confirmation
 * email, same linked posting, exact job URL, or same company + strongly-overlapping role title. */
function alreadyTracked(
  parsed: ParsedApplicationEmail,
  linkedPostingId: string | null,
  existing: ExistingApplication[]
): boolean {
  const parsedCompany = normalizeCompanyName(parsed.company);
  const parsedUrl = parsed.jobUrl ? jobIdentityKey(parsed.jobUrl) : null;

  return existing.some((app) => {
    if (app.source_ref && app.source_ref === parsed.emailId) return true;
    if (linkedPostingId && app.posting_id === linkedPostingId) return true;
    if (parsedUrl && app.job_url && jobIdentityKey(app.job_url) === parsedUrl) return true;
    if (normalizeCompanyName(app.company) !== parsedCompany) return false;
    return titleOverlapRatio(parsed.roleTitle, app.role_title) >= TITLE_MATCH_THRESHOLD;
  });
}

/**
 * Turn a batch of inbound emails into `applications` rows.
 *
 * - Parses each email (`parseConfirmationEmail`); non-application mail is ignored.
 * - Resolves the company name against target-companies.json so it matches the rest of the app.
 * - Links to a specific posting when the URL or company+title makes it unambiguous.
 * - High-confidence parses become `review_state: "confirmed"` rows immediately; low-confidence
 *   ones become `review_state: "pending"` for a one-click confirm on the Applications page.
 * - Idempotent: an email whose id is already on a row (or that matches an existing application)
 *   is skipped, so re-running over the same inbox window is safe.
 *
 * `sinceHint` (optional) seeds the watermark when no emails come back, so an empty run still
 * advances the "last checked" marker.
 */
export async function reconcileConfirmationEmails(
  emails: RawEmail[],
  sinceHint?: string
): Promise<ReconcileSummary> {
  const supabase = getSupabaseServerClient();

  const [applicationsRes, postingsRes, canonicalNames] = await Promise.all([
    supabase
      .from("applications")
      .select("id, company, role_title, job_url, posting_id, source_ref"),
    supabase
      .from("postings")
      .select("id, company, title, url")
      .eq("is_active", true),
    loadCanonicalCompanyNames(),
  ]);

  if (applicationsRes.error) throw new Error(applicationsRes.error.message);
  if (postingsRes.error) throw new Error(postingsRes.error.message);

  const existing = (applicationsRes.data ?? []) as ExistingApplication[];
  const postings = (postingsRes.data ?? []) as CandidatePosting[];

  const despacedCanonicalIndex = buildDespacedIndex(canonicalNames);

  const rows: ReconcileRowResult[] = [];
  let maxEmailDate = sinceHint ?? null;

  for (const email of emails) {
    if (email.date && (!maxEmailDate || email.date > maxEmailDate)) {
      maxEmailDate = email.date;
    }

    // Prefer the reading the calling session already did over the keyword heuristics. The
    // session has the whole email in front of it and judges phrasing the marker lists can't
    // enumerate ("we can't move forward with your application" is a rejection; a requisition id
    // is not a job title). `parseConfirmationEmail` stays as the fallback for a caller that
    // supplies no classification.
    const parsed = email.classification
      ? classificationToParsed(email, email.classification)
      : parseConfirmationEmail(email);
    if (!parsed) continue;

    // Resolve the emailed company name to the canonical spelling (handles ATS slugs like
    // "analogdevices" → "Analog Devices").
    parsed.company = resolveCompanyName(parsed, canonicalNames, despacedCanonicalIndex);

    const linkedPosting = findMatchingPosting(
      { company: parsed.company, roleTitle: parsed.roleTitle, jobUrl: parsed.jobUrl },
      postings
    );
    const linkedPostingId = linkedPosting?.id ?? null;

    if (existing.some((app) => app.source_ref === parsed.emailId)) {
      rows.push({
        emailId: parsed.emailId,
        company: parsed.company,
        roleTitle: parsed.roleTitle,
        status: parsed.status,
        outcome: "skipped_duplicate_email",
        postingLinked: Boolean(linkedPostingId),
      });
      continue;
    }

    if (alreadyTracked(parsed, linkedPostingId, existing)) {
      rows.push({
        emailId: parsed.emailId,
        company: parsed.company,
        roleTitle: parsed.roleTitle,
        status: parsed.status,
        outcome: "skipped_already_tracked",
        postingLinked: Boolean(linkedPostingId),
      });
      continue;
    }

    const reviewState = parsed.confidence === "high" ? "confirmed" : "pending";

    const { data: inserted, error: insertError } = await supabase
      .from("applications")
      .insert({
        posting_id: linkedPostingId,
        company: parsed.company,
        role_title: parsed.roleTitle,
        job_url: parsed.jobUrl ?? linkedPosting?.url ?? null,
        status: parsed.status,
        date_applied: parsed.appliedOn,
        last_status_change_at: `${parsed.appliedOn}T12:00:00Z`,
        source: "email",
        review_state: reviewState,
        source_ref: parsed.emailId,
        notes: `Auto-detected from a confirmation email ("${parsed.subject.slice(0, 120)}").`,
      })
      .select("id, company, role_title, job_url, posting_id, source_ref")
      .single();

    if (insertError || !inserted) {
      rows.push({
        emailId: parsed.emailId,
        company: parsed.company,
        roleTitle: parsed.roleTitle,
        status: parsed.status,
        outcome: "error",
        postingLinked: Boolean(linkedPostingId),
        detail: insertError?.message ?? "insert returned no row",
      });
      continue;
    }

    // Keep the in-memory list current so a second email for the same role in this same batch
    // dedupes against the row we just wrote.
    existing.push(inserted as ExistingApplication);

    const events: { application_id: string; status: ApplicationStatus; changed_at: string }[] = [
      { application_id: inserted.id, status: "applied", changed_at: `${parsed.appliedOn}T12:00:00Z` },
    ];
    if (parsed.status !== "applied") {
      events.push({
        application_id: inserted.id,
        status: parsed.status,
        changed_at: `${parsed.appliedOn}T18:00:00Z`,
      });
    }
    await supabase.from("application_status_events").insert(events);

    rows.push({
      emailId: parsed.emailId,
      company: parsed.company,
      roleTitle: parsed.roleTitle,
      status: parsed.status,
      outcome: reviewState === "confirmed" ? "inserted_confirmed" : "inserted_pending",
      postingLinked: Boolean(linkedPostingId),
    });
  }

  const watermark = maxEmailDate ?? new Date().toISOString();
  await setReconcileWatermark(watermark);

  return {
    received: emails.length,
    parsed: rows.length,
    insertedConfirmed: rows.filter((r) => r.outcome === "inserted_confirmed").length,
    insertedPending: rows.filter((r) => r.outcome === "inserted_pending").length,
    skippedDuplicateEmail: rows.filter((r) => r.outcome === "skipped_duplicate_email").length,
    skippedAlreadyTracked: rows.filter((r) => r.outcome === "skipped_already_tracked").length,
    errors: rows.filter((r) => r.outcome === "error").length,
    watermark,
    rows,
  };
}
