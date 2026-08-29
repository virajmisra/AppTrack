-- Auto-detection of applications from Gmail confirmation emails.
--
-- The reconcile pipeline (src/lib/reconcile.ts, POST /api/applications/reconcile) turns
-- application-confirmation emails into `applications` rows so the Postings tab stops showing
-- things you've already applied to, without you clicking anything.
--
-- Detected rows are still real `applications` rows (so they hide their posting immediately and
-- carry status events like any other) but are tagged so the UI can tell them apart:
--   source        - where the row came from: 'feed' (Mark applied button), 'manual' (the form),
--                   'email' (auto-detected from a confirmation email)
--   review_state  - 'confirmed' (trusted: manual, feed, or a high-confidence email match) or
--                   'pending' (a lower-confidence email match awaiting a one-click confirm on
--                   the Applications page; dismissing deletes the row and un-hides the posting)
--   source_ref    - the Gmail message id a detection came from, so re-running the pipeline over
--                   the same inbox window never double-inserts

alter table applications
  add column source text not null default 'manual'
    check (source in ('feed', 'manual', 'email'));

alter table applications
  add column review_state text not null default 'confirmed'
    check (review_state in ('pending', 'confirmed'));

alter table applications
  add column source_ref text;

-- Existing rows: anything pinned to a posting came from the "Mark applied" button.
update applications set source = 'feed' where posting_id is not null;
-- Everything already in the table predates detection, so treat it all as reviewed.
update applications set review_state = 'confirmed';

-- One application per confirmation email.
create unique index applications_source_ref_idx
  on applications (source_ref)
  where source_ref is not null;

create index applications_review_state_idx on applications (review_state);
