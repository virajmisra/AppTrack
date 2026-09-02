# AppTrack

A job board for one person. It collects software engineering internship postings from company
job boards, narrows them to the ones worth applying to, and tracks the applications.

## What it does

- Pulls postings from Greenhouse, Lever and public GitHub internship feeds — 31 company boards
  and 2 feeds, around 2,000 active postings at any time.
- Narrows them to technical roles at companies on a hand-curated allowlist.
- Reads each posting's description to drop the ones an undergraduate can't apply to (security
  clearance required, graduate students only) and to pull out the pay range.
- Tracks applications, picking most of them up automatically from confirmation emails.
- Hides postings once you've applied — or once you've decided you won't.

## Running it

Needs a [Supabase](https://supabase.com) project.

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase URL and service role key
npm run dev
```

There is no migration runner: run each file in `supabase/migrations/` once, in order, in the
Supabase SQL editor.

```bash
npm test        # node --test
npm run lint
```

## Configuration

Three files are meant to be edited by hand as gaps show up:

| File | What it holds |
| --- | --- |
| `sources.json` | Which job boards to pull from |
| `target-companies.json` | Which companies are worth applying to |
| `company-tiers.json` | Optional. How demanding each company's interview loop is, used to sort postings. See `company-tiers.example.json` for the shape — without it, everything reads as unrated. |

## Architecture

[`AGENTS.md`](AGENTS.md) documents how the pipeline fits together and why it is built this way.
