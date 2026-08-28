-- Best-effort, display-only pay text extracted from posting descriptions when present.
-- Not structured/authoritative — see lib/greenhouse.ts extractPayRange for the extraction logic.
alter table postings add column pay_range_text text;
