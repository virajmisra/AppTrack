-- Best-effort eligibility gate: description text (scraped or already-fetched) plus a
-- pass/fail flag computed from it. Defaults to eligible=true so nothing is hidden until
-- a check actively finds a disqualifier or genuinely can't be verified.
alter table postings add column description_text text;
alter table postings add column is_eligible boolean not null default true;
alter table postings add column eligibility_checked_at timestamptz;
