-- AppTrack initial schema
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query) for a fresh project.

create extension if not exists pgcrypto;

create table postings (
  id uuid primary key default gen_random_uuid(),
  source text not null,                 -- e.g. 'greenhouse'
  company text not null,                -- e.g. 'Stripe'
  external_id text not null,            -- id from the source API
  title text not null,
  location text,
  department text,
  url text not null,
  posted_at timestamptz,                -- best-effort, from source's updated_at
  first_seen_at timestamptz not null default now(),  -- drives "new since last visit"
  last_seen_at timestamptz not null default now(),   -- bumped every sync; stale = delisted
  is_active boolean not null default true,
  raw jsonb,                            -- raw API payload, for future-proofing
  created_at timestamptz not null default now(),
  unique (source, company, external_id)
);

create index postings_active_first_seen_idx on postings (is_active, first_seen_at desc);

create table applications (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid references postings(id) on delete set null,  -- null for manually-added applications
  company text not null,
  role_title text not null,
  job_url text,
  status text not null default 'applied'
    check (status in ('applied', 'oa', 'interview', 'offer', 'rejected')),
  date_applied date not null default current_date,
  deadline date,
  notes text,
  last_status_change_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_status_idx on applications (status);
create index applications_posting_idx on applications (posting_id);

create table application_status_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  status text not null check (status in ('applied', 'oa', 'interview', 'offer', 'rejected')),
  changed_at timestamptz not null default now()
);

create index application_status_events_app_idx on application_status_events (application_id, changed_at);

create table app_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger applications_set_updated_at
  before update on applications
  for each row execute function set_updated_at();
