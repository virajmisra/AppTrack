---
name: add-source
description: Add a new job-posting source to AppTrack — verify an ATS board token actually serves public JSON, add it to sources.json, sync, and confirm postings land. Use when asked to add a company, board, ATS provider, or GitHub feed to the postings pipeline.
---

# Adding a posting source

`sources.json` has three hand-editable arrays: `greenhouse`, `lever`, and `githubFeeds`. Adding a
company is usually a config-only change. Adding a *provider* means a new fetch module.

**Verify before you add.** `sync.ts` throws on a non-OK response from any Greenhouse or Lever
board, and a throw aborts the entire sync — one dead token takes down every source behind it. Most
tokens do not work: of ~50 Lever candidates probed, only 4 had the public v0 API enabled, and
5 of 28 Greenhouse candidates 404'd.

## Adding a company to an existing provider

**1. Probe the token.** It must return a JSON array (Lever) or a `jobs` array (Greenhouse):

```bash
# Lever — a JSON array means enabled; {"ok":false,"error":"Document not found"} means it is not
curl -s "https://api.lever.co/v0/postings/<token>?mode=json&limit=1" | head -c 200

# Greenhouse — expect HTTP 200
curl -s -o /dev/null -w "%{http_code}\n" "https://boards-api.greenhouse.io/v1/boards/<token>/jobs"
```

**2. Check it actually yields matching roles.** A board that returns 200 but has no intern SWE
postings costs a multi-megabyte fetch every sync for nothing (Lever `?mode=json` returns full
descriptions — Palantir's board is ~5.8 MB). Pull the titles and apply the same filter
`src/lib/keyword-filter.ts` would:

```bash
curl -s "https://boards-api.greenhouse.io/v1/boards/<token>/jobs" \
  | jq -r '.jobs[].title' | grep -iE 'intern|co-?op' | grep -iE 'software|swe|machine learning|data|product'
```

Prefer boards with current matches. A strong target company with zero matches right now is
still reasonable to add — postings are seasonal — but note it rather than adding many at once.

**3. Add the entry**, copying the `requireAllGroups` / `excludeAny` block verbatim from a
neighbouring entry so filtering stays uniform:

```json
{ "name": "<Display Name>", "boardToken": "<token>",
  "requireAllGroups": [["intern", "internship", "co-op", "coop"], ["software engineer", "..."]],
  "excludeAny": ["senior", "staff", "principal", "lead", "phd", "mba"] }
```

`name` is what lands in `postings.company` and is matched against `target-companies.json` by
`normalizeCompanyName` (exact match after normalisation, deliberately not substring), so it must
match the allowlist spelling. Add it to `target-companies.json` too if it is not already there.

**4. Sync and confirm** the new entry appears with a non-zero `fetched`:

```bash
curl -s -X POST http://localhost:3000/api/sync | jq '.results[] | select(.source | test("<Name>"))'
```

**5. Run it twice.** On the second sync the new source's `deactivated` should be ~0 — anything
else means the per-company deactivation scope is wrong and it is expiring its own rows.

## Adding a GitHub feed

Feed entries need a `schema` matching one of the shapes in `src/lib/github-feed.ts`:
`categorized` (SimplifyJobs — filters on an entry `category` allowlist) or `keyword`
(title keywords). Fetch the raw `listings.json` and confirm its entries carry the fields
`SimplifyEntry` or `VanshEntry` expects before adding. A feed with a different shape needs a new
`schema` branch in both `github-feed.ts` and `src/lib/sources.ts` — say so rather than forcing it.

Note that new-grad feeds are not internship feeds: the `requireAllGroups` blocks all require an
intern keyword, so a new-grad listing file will silently match almost nothing.

## Adding a whole provider

Follow `src/lib/lever.ts` — it is the smallest complete example. The pieces are:

1. A `<Provider>Source` interface and config key in `src/lib/sources.ts` (plus the `loadSources`
   default).
2. A fetch module returning `NormalizedPosting[]`, filtered through `titleMatchesFilters`.
3. The source string added to `NormalizedPosting["source"]` in `src/lib/postings.ts`.
4. A per-company loop in `sync.ts` mirroring the Greenhouse one — upsert on
   `source,company,external_id`, then deactivate that source+company's rows older than
   `syncStartedAt`.
5. If the provider returns descriptions inline, an extractor in `src/lib/description.ts` and a
   branch in `enrichEligibility()`, so those postings skip the capped external-fetch path.

No DB migration is needed — `postings.source` is untyped `text`.

**Watch the date field.** `posted_at` drives the 30-day recency filter in `src/app/page.tsx`. Lever's
`createdAt` is when the requisition was created, not when the role was posted: Palantir's spans up
to 10 years, so 55 of 56 eligible Palantir postings are filtered out of the page. If a provider's
date has this problem, say so — it decides whether the source shows up at all.
