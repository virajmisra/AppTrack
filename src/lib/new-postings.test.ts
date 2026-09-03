import assert from "node:assert/strict";
import { test } from "node:test";
import { diffNewPostingIds, parseIdList } from "./new-postings.ts";

test("diffNewPostingIds returns ids absent from the last visit", () => {
  assert.deepEqual(diffNewPostingIds(["a", "b", "c"], ["a", "c"]), ["b"]);
});

test("diffNewPostingIds preserves the order postings arrived in", () => {
  assert.deepEqual(diffNewPostingIds(["d", "a", "e", "b"], ["a", "b"]), ["d", "e"]);
});

test("diffNewPostingIds returns nothing when every posting was already seen", () => {
  assert.deepEqual(diffNewPostingIds(["a", "b"], ["a", "b", "gone"]), []);
});

// A first-ever visit must not mark the entire feed — that's noise, not a signal.
test("diffNewPostingIds marks nothing when there is no previous visit on record", () => {
  assert.deepEqual(diffNewPostingIds(["a", "b", "c"], null), []);
});

// Distinct from the null case: an empty array is a real visit that saw no postings, so
// everything on this visit genuinely is new.
test("diffNewPostingIds treats a recorded empty visit as having seen nothing", () => {
  assert.deepEqual(diffNewPostingIds(["a", "b"], []), ["a", "b"]);
});

test("parseIdList reads back a stored list", () => {
  assert.deepEqual(parseIdList(JSON.stringify(["a", "b"])), ["a", "b"]);
});

test("parseIdList returns null when nothing is stored", () => {
  assert.equal(parseIdList(null), null);
});

test("parseIdList returns null for unparseable or non-array values", () => {
  assert.equal(parseIdList("{not json"), null);
  assert.equal(parseIdList(JSON.stringify({ ids: ["a"] })), null);
  assert.equal(parseIdList(JSON.stringify("a")), null);
});

test("parseIdList drops non-string entries rather than rejecting the whole list", () => {
  assert.deepEqual(parseIdList(JSON.stringify(["a", 7, null, "b"])), ["a", "b"]);
});

// The round trip the hook actually performs: commit this visit's ids, then diff the next
// visit's ids against what came back out of storage.
test("a committed visit makes only genuinely added postings new on the next visit", () => {
  const firstVisit = ["a", "b"];
  const stored = JSON.stringify(firstVisit);
  assert.deepEqual(diffNewPostingIds(["c", "a", "b"], parseIdList(stored)), ["c"]);
});
