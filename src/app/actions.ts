"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** Postgres `undefined_column`, and PostgREST's schema-cache equivalent. Migrations here are run
 * by hand in the Supabase SQL Editor (see AGENTS.md), so "the column isn't there yet" is a real
 * state a user can land in — worth naming rather than surfacing a raw PostgREST message. */
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

function describeError(error: { code?: string; message: string }): string {
  if (error.code && MISSING_COLUMN_CODES.has(error.code)) {
    return "Hiding postings needs the `hidden_at` column. Run supabase/migrations/0005_hide_postings.sql in the Supabase SQL Editor.";
  }
  return error.message;
}

/** Hide a posting the user has decided not to apply to, so it stops coming back on every visit.
 *
 * Distinct from marking it applied: no `applications` row is created, nothing shows on the
 * Applications tab, and no status events are recorded. This is purely "stop showing me this".
 * Reversible via `unhidePosting` — the Postings tab keeps a "Show hidden" toggle rather than
 * making the decision permanent, since a posting dismissed in a scanning pass is easy to want
 * back. */
export async function hidePosting(postingId: string) {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("postings")
    .update({ hidden_at: new Date().toISOString() })
    .eq("id", postingId)
    .is("hidden_at", null);
  if (error) throw new Error(describeError(error));

  revalidatePath("/");
}

/** Restore a hidden posting to the feed. */
export async function unhidePosting(postingId: string) {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("postings")
    .update({ hidden_at: null })
    .eq("id", postingId);
  if (error) throw new Error(describeError(error));

  revalidatePath("/");
}
