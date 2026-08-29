"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/types/database";

export async function markPostingApplied(postingId: string) {
  const supabase = getSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("applications")
    .select("id")
    .eq("posting_id", postingId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return; // already applied to this posting — no-op

  const { data: posting, error: postingError } = await supabase
    .from("postings")
    .select("company, title, url")
    .eq("id", postingId)
    .single();
  if (postingError || !posting) throw new Error(postingError?.message ?? "Posting not found");

  const { data: application, error: insertError } = await supabase
    .from("applications")
    .insert({
      posting_id: postingId,
      company: posting.company,
      role_title: posting.title,
      job_url: posting.url,
      status: "applied",
    })
    .select("id")
    .single();
  if (insertError || !application) throw new Error(insertError?.message ?? "Insert failed");

  const { error: eventError } = await supabase
    .from("application_status_events")
    .insert({ application_id: application.id, status: "applied" });
  if (eventError) throw new Error(eventError.message);

  revalidatePath("/");
  revalidatePath("/applications");
}

export async function createManualApplication(formData: FormData) {
  const company = String(formData.get("company") ?? "").trim();
  const roleTitle = String(formData.get("role_title") ?? "").trim();
  const jobUrl = String(formData.get("job_url") ?? "").trim() || null;
  const dateApplied = String(formData.get("date_applied") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!company || !roleTitle) {
    throw new Error("Company and role title are required");
  }

  const supabase = getSupabaseServerClient();

  const { data: application, error: insertError } = await supabase
    .from("applications")
    .insert({
      company,
      role_title: roleTitle,
      job_url: jobUrl,
      status: "applied",
      notes,
      ...(dateApplied ? { date_applied: dateApplied } : {}),
    })
    .select("id")
    .single();
  if (insertError || !application) throw new Error(insertError?.message ?? "Insert failed");

  const { error: eventError } = await supabase
    .from("application_status_events")
    .insert({ application_id: application.id, status: "applied" });
  if (eventError) throw new Error(eventError.message);

  revalidatePath("/applications");
}

/** Accept a queued email-detected application: it stops showing in the review strip and is
 * treated like any other tracked application from here on. */
export async function confirmDetectedApplication(applicationId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("applications")
    .update({ review_state: "confirmed" })
    .eq("id", applicationId)
    .eq("review_state", "pending");
  if (error) throw new Error(error.message);

  revalidatePath("/applications");
  revalidatePath("/");
}

/** Reject a queued email-detected application: the row (and its status events) are deleted, so
 * the linked posting reappears in the Postings feed. Only ever touches pending email detections —
 * a manually-added or already-confirmed row can't be removed this way. */
export async function dismissDetectedApplication(applicationId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .eq("review_state", "pending")
    .eq("source", "email");
  if (error) throw new Error(error.message);

  revalidatePath("/applications");
  revalidatePath("/");
}

export async function updateApplicationStatus(applicationId: string, status: ApplicationStatus) {
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("applications")
    .update({ status, last_status_change_at: now })
    .eq("id", applicationId);
  if (updateError) throw new Error(updateError.message);

  const { error: eventError } = await supabase
    .from("application_status_events")
    .insert({ application_id: applicationId, status });
  if (eventError) throw new Error(eventError.message);

  revalidatePath("/applications");
  revalidatePath("/");
}
