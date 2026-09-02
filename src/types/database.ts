export type ApplicationStatus = "applied" | "oa" | "interview" | "offer" | "rejected";

/** Reputation/interview-loop tier for a company. Canonical definition and the lookup live in
 * `src/lib/company-tier.ts`; mirrored here so the slim `PostingRowData` doesn't have to import
 * that (server-only) module. */
export type InterviewFit = "ready_now" | "target" | "reach" | "unrated";

/** Where an application row came from. 'feed' = the "Mark applied" button on a posting,
 * 'manual' = the add-application form, 'email' = auto-detected from a confirmation email. */
export type ApplicationSource = "feed" | "manual" | "email";

/** 'pending' = a low-confidence email detection awaiting a one-click confirm (still hides its
 * posting; dismissing deletes the row). 'confirmed' = trusted. */
export type ApplicationReviewState = "pending" | "confirmed";

export interface Posting {
  id: string;
  source: string;
  company: string;
  external_id: string;
  title: string;
  location: string | null;
  department: string | null;
  url: string;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  pay_range_text: string | null;
  raw: unknown;
  created_at: string;
  description_text: string | null;
  is_eligible: boolean;
  eligibility_checked_at: string | null;
  /** Set when the user hides a posting they've decided not to apply to; null = visible. */
  hidden_at: string | null;
}

/** Slim, fully-serializable projection of a `Posting` handed to the client-side Postings
 * explorer. Deliberately omits `raw` (arbitrary API JSON) and `description_text` (long) to keep
 * the RSC payload small, and precomputes the interview-fit tier server-side so
 * `src/lib/company-tier.ts` (kilobytes of company-name arrays) never reaches the client bundle. */
export interface PostingRowData {
  id: string;
  company: string;
  title: string;
  url: string;
  location: string | null;
  payRangeText: string | null;
  /** `Date.parse(posted_at ?? first_seen_at)` — epoch ms, for client-side bucketing. */
  postedTs: number;
  /** `posted_at` was null, so `postedTs` is really `first_seen_at` (when we first saw it). */
  approximate: boolean;
  interviewFit: InterviewFit;
  /** The user hid this posting. Hidden rows are still sent to the client so the explorer can
   * count them and reveal them on demand without a refetch. */
  hidden: boolean;
}

export interface Application {
  id: string;
  posting_id: string | null;
  company: string;
  role_title: string;
  job_url: string | null;
  status: ApplicationStatus;
  date_applied: string;
  deadline: string | null;
  notes: string | null;
  last_status_change_at: string;
  created_at: string;
  updated_at: string;
  source: ApplicationSource;
  review_state: ApplicationReviewState;
  /** Gmail message id for email-detected rows; dedupe key for the reconcile pipeline. */
  source_ref: string | null;
}

/** An `Application` plus its company's interview tier, resolved on the server so the client
 * bundle never pulls in `src/lib/company-tier.ts` — same reason `PostingRowData` precomputes it. */
export interface ApplicationRowData extends Application {
  interviewFit: InterviewFit;
}

export interface ApplicationStatusEvent {
  id: string;
  application_id: string;
  status: ApplicationStatus;
  changed_at: string;
}

export interface AppMeta {
  key: string;
  value: unknown;
  updated_at: string;
}
