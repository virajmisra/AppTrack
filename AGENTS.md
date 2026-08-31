<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the dev server (local-only, no auth)
- `npm run build` / `npm run start` — production build / start
- `npm run lint` — ESLint
- `npm test` — `node --test` over `src/**/*.test.ts` (no test-runner dependency; relies on `--experimental-strip-types`, so test files import siblings with the explicit `.ts` extension). Only `src/lib/application-emails.test.ts` so far — real-email fixtures pinning the confirmation-email parser.
- Schema changes live in `supabase/migrations/*.sql`, but there's no migration runner wired up — each migration is run manually, once, in the Supabase SQL Editor (true for `0001_init.sql` through `0004_application_detection.sql`).
- A sync can be triggered manually outside the browser: `curl -X POST http://localhost:3000/api/sync`.
- Application auto-detection: `GET /api/applications/reconcile` returns `{ watermark, since, suggestedQuery }`; `POST` it `{ emails: RawEmail[] }` (confirmation emails fetched via Gmail) and it turns them into `applications` rows. Meant to be run by the hourly check — see the Architecture note.
- Required env vars in `.env.local` (gitignored): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Architecture

The postings pipeline is three deliberately decoupled layers:

1. **Ingestion** (wide recall, casts a wide net on purpose): `sources.json` config → `src/lib/greenhouse.ts` / `src/lib/github-feed.ts` fetch each source → `src/lib/keyword-filter.ts` (role keywords) + `src/lib/terms.ts` (season/term filtering) narrow to plausible SWE/AI-ML/Data/Product postings → `src/lib/postings.ts` normalizes into `NormalizedPosting` and dedupes by URL → `src/lib/sync.ts` upserts into `postings` and deactivates anything not re-seen (`last_seen_at`-based, not an IN-list, since GitHub-feed URLs are numerous/long).

2. **Eligibility gate** (also computed at sync time, cached in the DB — never live on page load): `src/lib/description.ts` gets each posting's description (Greenhouse: already saved in `raw.content`, no fetch needed; GitHub-feed: a bounded, best-effort server-side fetch of the posting URL, `null` on failure or on pages that render their description client-side, which it can't see into) → `src/lib/eligibility.ts` flags high-confidence disqualifiers (clearance required, graduate-degree-only, new-grad-in-disguise) → `sync.ts`'s `enrichEligibility()` runs this in capped batches (200/sync, ~10 concurrent) so a schema-wide backfill spreads across several syncs instead of blocking one. `postings.is_eligible` defaults `true` — unverifiable is never treated as disqualified.

3. **Display-layer filtering & ranking** (in `src/app/page.tsx`, not ingestion — so the ingested set stays flexible): `target-companies.json` is a hand-curated, hand-editable allowlist of companies worth applying to (matched via `src/lib/target-companies.ts`'s `normalizeCompanyName`, exact-match after normalization, deliberately not substring, to avoid e.g. "Meta" matching "Metabase"); `src/lib/posting-fit.ts` combines that allowlist with a technical-role title check; `src/lib/company-tier.ts` layers on a **reputation-based heuristic** (not verified data) scoring prestige vs. typical interview-loop weight, driving the Postings tab's "Opportunity" tier label and row styling. All three of these files are meant to be edited by hand as gaps are noticed, same spirit as `sources.json`.

**Postings tab rendering**: `page.tsx` (server component) runs the pipeline above, then projects each `Posting` to a slim, fully-serializable `PostingRowData` (`src/types/database.ts` — precomputes `postedTs` = `posted_at ?? first_seen_at` and the interview-fit tier, and deliberately omits `raw`/`description_text` and the `company-tier.ts` module from the client bundle) and hands the array to `src/components/postings-explorer.tsx` (`"use client"`). That island owns all view state — search text, a date-bucket filter, an Opportunity-tier filter — and does the filtering/grouping/counting in one `useMemo`, no refetch. Date bucketing (`src/lib/date-buckets.ts`, pure) runs in the browser against the local clock, seeded by a server `nowSeed` prop so SSR and first client render agree; rows group under "Posted today / Yesterday / Past week / Past month / Older" headers. Relative-time chips (`src/components/relative-time.tsx`) and `src/components/last-synced.tsx` share the `useSyncExternalStore` "render `…` on the server, real value on the client" pattern to stay hydration-safe; shared date formatting lives in `src/lib/format.ts`. `src/components/posting-row.tsx` is one responsive component (CSS grid on `sm`+, stacked below). Nav active state: `src/components/nav-links.tsx` (`"use client"`, `usePathname`).

**Applications tracking** is a separate, independent flow: `applications` + `application_status_events` tables, server actions in `src/app/applications/actions.ts`. It has no dependency on the fit/eligibility filters above — marking something applied or adding one manually always works regardless of whether it'd currently pass the Postings tab's filters. A row hides its posting from the Postings tab the moment it exists (`applicationMatchesPosting` in `src/lib/application-match.ts` — exact `posting_id`/`job_url`, else same company + ≥60% title-word overlap; a row pinned by id/url never *also* fuzzy-hides that company's sibling roles).

**Application auto-detection** keeps the tracker current without manual clicks. `src/lib/application-emails.ts` parses a confirmation email into `{company, roleTitle, jobUrl?, status, confidence}` — heuristic and deliberately conservative (unknown → `null` or `confidence: "low"`); `src/lib/reconcile.ts` resolves the company against `target-companies.json`, links a posting, and writes an `applications` row tagged `source='email'` with `review_state` `'confirmed'` (high-confidence) or `'pending'` (queued in the amber strip on the Applications page for a one-click confirm; "Not me" deletes the row and the posting returns). `source_ref` (the Gmail message id) makes re-runs idempotent. The app has no Gmail credentials of its own — the **hourly check** is expected to `GET /api/applications/reconcile` for `{since, suggestedQuery}`, run that Gmail search with its own tools, and `POST` the messages back as `{emails: [{id, from, subject, bodyText, date}]}`. The parser has a fixture test (`npm test`); extend it when you touch the heuristics.

**Staging applications via browser automation**: `applicant-profile.json` (repo root, gitignored — holds real PII) feeds a chat-driven workflow using the `claude-in-chrome` tools to open a posting's real application form, fill in what's known, and stop before submit — never an automated app feature, always driven live in conversation.

**Known constraint**: macOS's case-insensitive filesystem previously caused a real incident (`apptrack` vs `AppTrack` resolved to the same directory, and a cleanup `rm -rf` deleted the whole project) — worth keeping in mind for any temp-directory scaffolding.
