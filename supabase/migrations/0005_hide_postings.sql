-- Hiding postings you've decided not to apply to.
--
-- The Postings tab already hides anything with an `applications` row (see
-- src/lib/application-match.ts). That covers "I applied to this". It does not cover the much more
-- common "I looked at this and I'm not going to apply" — those postings kept reappearing on every
-- visit for the full 30-day recency window.
--
-- `hidden_at` records that decision. Null = visible (the default, so every existing row is
-- unaffected). Non-null = the user hid it, and the timestamp is kept rather than a bare boolean so
-- the "Hidden" view can be ordered most-recently-hidden first.
--
-- Deliberately a column on `postings` rather than a separate table: it is a per-posting attribute
-- with exactly one row per posting, the same shape as `is_eligible` / `eligibility_checked_at`.
-- It survives re-syncs because `toRow()` in src/lib/sync.ts never includes this column in its
-- upsert payload, so ON CONFLICT DO UPDATE leaves it alone.

alter table postings
  add column hidden_at timestamptz;

-- The Postings query filters on (is_active, is_eligible, hidden_at) on every page load; this keeps
-- the common "visible postings" scan off the hidden rows.
create index postings_visible_idx
  on postings (is_active, is_eligible, posted_at desc)
  where hidden_at is null;
