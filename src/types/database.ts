export type ApplicationStatus = "applied" | "oa" | "interview" | "offer" | "rejected";

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
