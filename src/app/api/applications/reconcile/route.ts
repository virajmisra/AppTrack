import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { reconcileConfirmationEmails, getReconcileWatermark } from "@/lib/reconcile";
import { gmailConfirmationQuery, parseEmailClassification } from "@/lib/application-emails";
import type { RawEmail } from "@/lib/application-emails";

/**
 * Application auto-detection.
 *
 * GET  -> `{ watermark, suggestedQuery, classificationContract }`. The caller (the hourly check)
 *         uses `watermark` as the "since" bound, `suggestedQuery` as the Gmail search string, and
 *         `classificationContract` as the shape to return its reading of each email in.
 * POST -> `{ emails: RawEmail[], since?: string }`. Each email may carry a `classification` — the
 *         calling session's own reading of it — which is used in preference to the keyword
 *         heuristics in application-emails.ts; emails without one fall back to those heuristics.
 *         Turns confirmations into `applications` rows (high-confidence auto-confirmed, the rest
 *         queued for review) and returns a `ReconcileSummary`.
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
    // Handed to the caller so the session and this endpoint can't drift on the shape. The app
    // has no Gmail access of its own, so whoever calls this has already read every email — they
    // should say what each one means rather than posting raw text for a regex to guess at.
    classificationContract: {
      note:
        "Attach `classification` to each email with your own reading of it. Emails without one " +
        "fall back to the keyword parser, which is strictly worse. Judge from the email's " +
        "meaning, not from set phrases.",
      fields: {
        isApplicationEmail:
          "boolean — false for job alerts, marketing, newsletters and recruiter cold-pitches, " +
          "which are then ignored.",
        company:
          "string|null — the company as a person would name it (\"Johns Hopkins APL\"), never " +
          "an ATS slug and never the role title.",
        roleTitle:
          "string|null — the role applied to, with requisition ids and locations stripped. Null " +
          "when the email genuinely never names one; do not invent it.",
        jobUrl: "string|null — a direct link to the posting or application, when present.",
        status:
          "\"applied\" | \"oa\" | \"interview\" | \"offer\" | \"rejected\" — where the " +
          "application stands as of this email. A turn-down is \"rejected\" however politely " +
          "it is worded.",
        confidence:
          "\"high\" | \"low\" — \"high\" only when company and role are both unambiguous " +
          "and the email plainly states what happened. \"low\" queues it for a one-click confirm.",
      },
    },
  });
}

function toRawEmail(value: unknown): RawEmail | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    typeof v.from !== "string" ||
    typeof v.subject !== "string" ||
    typeof v.bodyText !== "string" ||
    typeof v.date !== "string"
  ) {
    return null;
  }
  // A malformed classification is dropped rather than rejecting the email — it then falls back
  // to the heuristic parser, which is the pre-existing behaviour.
  const classification = parseEmailClassification(v.classification) ?? undefined;
  return {
    id: v.id,
    from: v.from,
    subject: v.subject,
    bodyText: v.bodyText,
    date: v.date,
    classification,
  };
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

  const emails = body.emails.map(toRawEmail).filter((e): e is RawEmail => e !== null);
  const rejected = body.emails.length - emails.length;
  const classified = emails.filter((e) => e.classification).length;
  const sinceHint = typeof body.since === "string" ? body.since : undefined;

  try {
    const summary = await reconcileConfirmationEmails(emails, sinceHint);
    if (summary.insertedConfirmed > 0 || summary.insertedPending > 0) {
      revalidatePath("/");
      revalidatePath("/applications");
    }
    return NextResponse.json({
      ...summary,
      malformedEmailsIgnored: rejected,
      // How many rows came from the caller's own reading vs. the fallback keyword parser.
      classifiedByCaller: classified,
      parsedByHeuristics: emails.length - classified,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reconcile failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
