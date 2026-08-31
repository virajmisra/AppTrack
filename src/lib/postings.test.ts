import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupePostings, jobIdentityKey, normalizeUrl } from "./postings.ts";
import type { Posting } from "../types/database.ts";

// Run with: npm test   (node --test --experimental-strip-types)

const posting = (over: Partial<Posting>): Posting =>
  ({
    id: "p1",
    source: "github-feed",
    company: "Palantir",
    external_id: "x",
    title: "Software Engineer, Internship",
    location: null,
    department: null,
    url: "https://jobs.lever.co/palantir/abc",
    posted_at: "2026-08-01T00:00:00Z",
    first_seen_at: "2026-08-01T00:00:00Z",
    last_seen_at: "2026-08-01T00:00:00Z",
    is_active: true,
    pay_range_text: null,
    raw: null,
    created_at: "2026-08-01T00:00:00Z",
    description_text: null,
    is_eligible: true,
    eligibility_checked_at: null,
    ...over,
  }) as Posting;

test("normalizeUrl strips tracking params, hash and trailing slash", () => {
  assert.equal(
    normalizeUrl("https://careers.roblox.com/jobs/8072713?gh_jid=8072713&gh_src=nnh32o631us"),
    "https://careers.roblox.com/jobs/8072713"
  );
  assert.equal(normalizeUrl("https://example.com/jobs/1/#top"), "https://example.com/jobs/1");
});

test("normalizeUrl keeps the /apply segment, so github-feed external_ids stay stable", () => {
  const url = "https://jobs.lever.co/palantir/4d29249a/apply";
  assert.equal(normalizeUrl(url), url);
});

test("jobIdentityKey folds a board's apply page onto the posting itself", () => {
  const canonical = "https://jobs.lever.co/palantir/4d29249a";
  assert.equal(jobIdentityKey(canonical), canonical);
  assert.equal(jobIdentityKey(`${canonical}/apply`), canonical);
  assert.equal(jobIdentityKey(`${canonical}/apply?src=feed`), canonical);
  assert.equal(jobIdentityKey("https://boards.greenhouse.io/acme/jobs/7/application"), "https://boards.greenhouse.io/acme/jobs/7");
});

test("jobIdentityKey leaves a job whose own path ends in something else alone", () => {
  const url = "https://example.com/careers/apply-engineering-intern";
  assert.equal(jobIdentityKey(url), url);
});

test("dedupePostings collapses a feed's apply URL onto the direct-source posting", () => {
  const deduped = dedupePostings([
    posting({ id: "feed", source: "github-feed", url: "https://jobs.lever.co/palantir/4d29249a/apply" }),
    posting({ id: "direct", source: "lever", url: "https://jobs.lever.co/palantir/4d29249a" }),
  ]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, "direct", "the direct-source row should win over the aggregator");
});

test("dedupePostings keeps genuinely different jobs on the same board", () => {
  const deduped = dedupePostings([
    posting({ id: "a", url: "https://jobs.lever.co/palantir/aaa/apply" }),
    posting({ id: "b", url: "https://jobs.lever.co/palantir/bbb" }),
  ]);
  assert.equal(deduped.length, 2);
});
