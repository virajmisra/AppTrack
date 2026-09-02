---
name: hourly-check
description: Run AppTrack's standing maintenance routine — sync postings, backfill target-companies.json, classify unrated companies in company-tier.ts, reconcile applications from Gmail, and verify. Use when asked to "perform the hourly check", "run the hourly check", or to bring the tracker up to date.
---

# AppTrack hourly check

A standing autonomous maintenance routine. It was originally a recurring cron job; it is now run
on request. Work against the current working copy of the repo — the project has moved
directories before, so never use a path baked into an old prompt.

Run the steps in order. Several are independent, but step 3 depends on step 2 having widened the
allowlist first.

## 1. Sync

Make sure the dev server is up (`npm run dev`), then:

```
curl -X POST http://localhost:3000/api/sync
```

The response summarises per-source `fetched`/`deactivated` counts plus an `eligibility` block. A
source that throws aborts the whole sync, so a board returning 404 shows up here as a hard
failure — see the `add-source` skill before adding tokens.

## 2. Backfill `target-companies.json`

Fetch the distinct companies of all currently active + eligible postings, normalise the names
the way `src/lib/target-companies.ts`'s `normalizeCompanyName` does, and add **every** company
not already on the allowlist.

```
scripts/db.sh 'postings?is_active=eq.true&is_eligible=eq.true&select=company' | jq -r '.[].company' | sort -u
```

Use `scripts/db.sh` rather than a bare curl: PostgREST silently caps an unranged query at 1000
rows and there are ~1900 active+eligible postings. A plain query truncates with no error and
drops real companies — this happened once and lost GlossGenius. The script pages past the cap.

**Do not apply a "well-known / well-paying" judgment call.** That reputation gate was explicitly
removed because it silently excluded good opportunities forever. Add universities, government
entities, and staffing agencies too. The only real filters are the eligibility gate and the
technical-role check already in the pipeline.

## 3. Classify unrated companies in `src/lib/company-tier.ts`

Re-diff active + eligible + target-matched postings that are inside the 30-day recency window
(`MAX_POSTING_AGE_MS` in `src/app/page.tsx`) and pass `isTechnicalRole`, against the
`READY_NOW` / `TARGET` / `REACH` arrays.

For each company `getInterviewFit()` returns `"unrated"` for, do real WebSearch-backed research
into its actual internship interview process (Glassdoor, LeetCode Discuss, Blind, levels.fyi,
interview guides) and classify it against the candidate's profile — full-stack web development
plus an LLM/NLP pipeline project; front half of NeetCode 150 done, back half not — into
`ready_now`, `target`, or `reach`. Append to the right array with a short rationale comment in
the existing style.

Research only **15–30 companies per run** and let the backlog drain over subsequent runs; never
try to clear the whole backlog in one pass. If a company's real process can't be found, leave it
unrated rather than guessing.

## 4. Reconcile applications from Gmail

```
curl http://localhost:3000/api/applications/reconcile   # -> { watermark, since, suggestedQuery, classificationContract }
```

Run that Gmail search with this session's own Gmail tools and fetch each thread's plaintext body.
Then **read each email yourself** and POST it back with your reading attached:

```
{ "emails": [ {
    "id", "from", "subject", "bodyText", "date",
    "classification": {
      "isApplicationEmail": true,
      "company": "Southwest Airlines",
      "roleTitle": "Spring 2027 Software Engineering Internships",
      "jobUrl": null,
      "status": "rejected",
      "confidence": "high"
    }
} ] }
```

`classificationContract` in the GET response is the authoritative field-by-field spec — read it
rather than relying on this example. In short:

- `isApplicationEmail` — false for job alerts, marketing, newsletters and recruiter cold-pitches.
  Those are ignored.
- `company` — as a person would name it ("Booz Allen Hamilton", not the `bah` sender slug, and
  never the role title).
- `roleTitle` — the role, with requisition ids and locations stripped. **Null when the email
  genuinely never names one** — don't invent it; a null title queues the row for review.
- `status` — `applied` / `oa` / `interview` / `offer` / `rejected`, as of *this* email. A
  turn-down is `rejected` however politely it is worded.
- `confidence` — `high` only when company and role are both unambiguous and the email plainly
  states what happened.

The endpoint resolves the company against `target-companies.json`, links a posting, and writes an
`applications` row — high-confidence auto-confirmed, the rest queued in the amber "Detected" strip
on the Applications page for a one-click confirm. It dedupes on the Gmail message id, so
re-running over the same window is safe.

This is how completed applications leave the Postings tab without anyone clicking anything.

**Why you classify rather than a parser:** `src/lib/application-emails.ts` still holds a keyword
and regex parser, and it is the fallback for any email posted *without* a `classification` — but
it is strictly worse and should not be the path this routine takes. It reads meaning off fixed
phrases, so it mis-parsed real mail in ways that are obvious to anything actually reading the
sentence: "we can't move forward with your application" was recorded as `applied` because that
exact wording wasn't in its rejection list; a leading requisition id swallowed a whole job title;
a company's spelled-out name landed in the role field. **If you find yourself wanting to add a
phrase to a marker list in that file, that's the signal to classify it here instead.**

**Why this runs from the Claude session rather than the app:** the app has no Gmail credentials of
its own — deliberately, to avoid adding a Google OAuth app and refresh token to `.env.local`. A
session therefore has to fetch these emails anyway, which is exactly why it should also be the one
reading them: it needs no new credentials and no API cost. Auto-confirming only high-confidence
readings is deliberate — an early version of the parser once produced a phantom "Acme Corp" row.

## 5. Verify

After any edit:

```
npm run lint && npm test && npx tsc --noEmit
```

and confirm the app still returns 200. Notify with a single line, and only if a file actually
changed.
