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
curl http://localhost:3000/api/applications/reconcile        # -> { watermark, since, suggestedQuery }
```

Run that Gmail search with this session's own Gmail tools, fetch each thread's plaintext body,
and POST them back to the same endpoint:

```
{ "emails": [ { "id", "from", "subject", "bodyText", "date" } ] }
```

The endpoint parses each with `src/lib/application-emails.ts`, resolves the company against
`target-companies.json`, links a posting, and writes an `applications` row — high-confidence
detections auto-confirmed, low-confidence queued in the amber "Detected" strip on the
Applications page for a one-click confirm. It dedupes on the Gmail message id, so re-running
over the same window is safe.

This is how completed applications leave the Postings tab without anyone clicking anything.

**Why this runs from the Claude session rather than the app:** it avoids adding a Google OAuth
app and refresh token to `.env.local`, which fits the local, Claude-driven architecture and
needs no new credentials. The app has no Gmail access of its own. Auto-confirming only
high-confidence parses is deliberate — the heuristic parser once produced a phantom
"Acme Corp" row.

## 5. Verify

After any edit:

```
npm run lint && npm test && npx tsc --noEmit
```

and confirm the app still returns 200. Notify with a single line, and only if a file actually
changed.
