import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { reconcileConfirmationEmails, getReconcileWatermark } from "@/lib/reconcile";
import { gmailConfirmationQuery } from "@/lib/application-emails";
import type { RawEmail } from "@/lib/application-emails";

/**
 * Application auto-detection.
 *
 * GET  -> `{ watermark, suggestedQuery }`. The caller (the hourly check) uses `watermark` as the
 *         "since" bound and `suggestedQuery` as the Gmail search string.
 * POST -> `{ emails: RawEmail[], since?: string }`. Parses the emails, turns confirmations into
 *         `applications` rows (high-confidence auto-confirmed, the rest queued for review), and
 *         returns a `ReconcileSummary`.
 *
 * Local-only app, so no auth — same posture as /api/sync.
 */

export async function GET() {
  const watermark = await getReconcileWatermark();
  const since = watermark ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return NextResponse.json({
    watermark,
    since,
    suggestedQuery: gmailConfirmationQuery(since),
  });
}

function isRawEmail(value: unknown): value is RawEmail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.from === "string" &&
    typeof v.subject === "string" &&
    typeof v.bodyText === "string" &&
    typeof v.date === "string"
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const body = (payload ?? {}) as { emails?: unknown; since?: unknown };
  if (!Array.isArray(body.emails)) {
    return NextResponse.json(
      { error: "Expected { emails: RawEmail[] } where RawEmail = { id, from, subject, bodyText, date }" },
      { status: 400 }
    );
  }

  const emails = body.emails.filter(isRawEmail);
  const rejected = body.emails.length - emails.length;
  const sinceHint = typeof body.since === "string" ? body.since : undefined;

  try {
    const summary = await reconcileConfirmationEmails(emails, sinceHint);
    if (summary.insertedConfirmed > 0 || summary.insertedPending > 0) {
      revalidatePath("/");
      revalidatePath("/applications");
    }
    return NextResponse.json({ ...summary, malformedEmailsIgnored: rejected });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reconcile failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
