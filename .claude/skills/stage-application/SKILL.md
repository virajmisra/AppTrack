---
name: stage-application
description: Stage a real job application in the browser — create the ATS account if needed, autofill with Simplify, verify every field, and stop on the Review page for the user to submit. Use when asked to stage, fill, or apply to postings, especially Workday ones.
---

# Staging an application

Drives a real application form in the user's Chrome with the `claude-in-chrome` tools. **Never
submits.** The user clicks Submit; everything up to the Review page is fair game.

Workday is the reason this exists: 34% of eligible postings are `*.myworkdayjobs.com`, and every
tenant is an isolated instance, so an account at `bah.wd1` is worthless at `jj.wd5`. Expect
roughly one new account per two applications — that sprawl, not the form filling, is the cost.

## Before staging anything

**List the specific postings for the user and get approval.** They asked for this explicitly.
Never work through a queue silently.

## Queue selection

Via `scripts/db.sh` over `postings?is_active=eq.true&is_eligible=eq.true` — **include `location`
in the selected columns.** Then filter, in order:

1. Host is `myworkdayjobs.com` (or the ATS being targeted).
2. Inside the 30-day window (`MAX_POSTING_AGE_MS` in `src/app/page.tsx`).
3. Passes `postingFitsGoals` — target company + technical role (`src/lib/posting-fit.ts`).
4. Not already covered by `applicationMatchesPosting` (`src/lib/application-match.ts`).
5. **`location` is in the US.** Hard rule, not an optimisation — it removes 42% of the Workday
   queue. The user is a US citizen with no Canadian work authorization, and the largest tenants
   by raw count (RBC 62, BMO, Autodesk Montreal, Intelcom, most of RTX and PwC) are all
   Toronto/Montreal. Filtering on a column the query never selected silently keeps every one of
   them, which is exactly how the first attempt at this went wrong.

Group by tenant host, most postings first — one account should cover as many applications as
possible.

## Standing answers — apply without asking

- Relation questions ("family member at this company / a government body / a regulator") → **No**.
- Military, veteran, clearance-held, government-service → **No**.
- Citizenship → US citizen; authorized to work in the US; **No** to sponsorship now or in future.
- Experience → only what is on the resume and in the Simplify profile. **Never invent** an
  employer, project, skill, or date to satisfy a required field.
- Voluntary Disclosures / Self Identify → `eeoDefault` from `applicant-profile.json`, verbatim.
  It is a single string covering gender, ethnicity, veteran status and disability alike.
- Desired pay → $25–30/hr where hourly is offered; the annual equivalent where only annual is
  accepted; blank whenever optional.
- "How did you hear about us?" → Job Board / Online Job Board, or the dropdown's closest match.
- Cover letter or extra document required → **skip the posting and report it.** Do not draft one.

## Per posting

1. **Account.** Look up the tenant host in `applicant-credentials.json` (repo root, gitignored).
   If absent, create the account using the profile `email` and a locally generated 20+ char
   password unique to that tenant, then record it there. Simplify does not do account creation.
2. **Verification email**, if the tenant demands one — find it with the Gmail tools and follow
   the link. Mark `verified` in the credentials file.
3. **Fill.** Use **Simplify Copilot** (installed in both Chrome profiles) as the primary filler
   on each wizard step. It carries the work history, education detail, skills, address and GPA
   that `applicant-profile.json` does *not*, so it does the heavy lifting on **My Experience**.
   Upload `resumePath` via `file_upload` wherever a resume is wanted. Fill by hand only what
   Simplify leaves empty: tenant-specific Application Questions, the standing answers above, and
   the disclosure steps.
4. **Verify with a subagent before advancing.** Hand a fresh subagent the filled page and have it
   independently read back every field against the profile, the resume and the standing answers,
   reporting only discrepancies. A separate reader is the whole point — autofill parsers mangle
   dates, employers and dropdowns, and whoever filled the form is the worst judge of whether it
   is right. Correct what it flags, then move on.
5. **Stop on Review.** Screenshot it. Do not click Submit.
6. **Report**: company, role, location, URL, whether an account was created, what the verifier
   flagged, and every field left blank.

## Stop and ask, never guess

Any required field the resume, the Simplify profile and the standing answers don't cover —
availability or start dates, free-text "why this company", anything unusual. This form reaches a
real employer under the user's name; a plausible-looking guess is worse than an unanswered
question.

## Report rather than fight

CAPTCHA or bot detection, SSO-only tenants, a demanded transcript or cover letter. Stop after 2–3
failed attempts on a step and hand back — do not loop on a failing interaction.

## Tracking

Nothing to write. Once the user submits, the confirmation email is picked up by the existing
reconcile flow (`src/lib/application-emails.ts` → `src/lib/reconcile.ts`, run by the
`hourly-check` skill), which creates the `applications` row and hides the posting. Until then the
posting stays on the tab, correctly — it hasn't been submitted.

Known gap: Booz Allen (`bah.wd1`) confirmation emails put the role in a `Subject:` line inside
the body, so they parse as company `BAH` with an unspecified role and collapse several
applications into one row. Staging Booz Allen roles makes that worse until the parser learns the
pattern.
