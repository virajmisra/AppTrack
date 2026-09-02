import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPayRange } from "./pay.ts";

// Run with: npm test   (node --test --experimental-strip-types)
//
// Fixtures are real `description_text` values from the `postings` table (trimmed to the sentence
// carrying the figure). They exist because the Pay column read "—" for every posting in the feed:
// GitHub-feed rows — 1,924 of 1,978 active postings — never ran extraction at all, and the
// original range-only pattern also missed the single-figure-plus-rate form that Palantir and
// others use, which was the most common way pay was actually stated.

test("range with a rate: the Palantir form", () => {
  assert.equal(
    extractPayRange(
      "Salary The salary range for this position is estimated to be $5,900 - $10,500/month. " +
        "Further note that total compensation for this position"
    ),
    "$5,900 - $10,500/month"
  );
});

test("single figure with a rate is pay — this was the most common miss", () => {
  assert.equal(
    extractPayRange(
      "Salary The estimated salary range for this position is estimated to be $10,000/month."
    ),
    "$10,000/month"
  );
});

test("single figure with an hourly rate and cents", () => {
  assert.equal(
    extractPayRange("the anticipated pay rate for this role is $27.00/hour. ***"),
    "$27.00/hour"
  );
});

test("range with a trailing currency", () => {
  assert.equal(
    extractPayRange("Hourly Pay Rate Range $44 - $63 USD Additional Information"),
    "$44 - $63 USD"
  );
});

test("range with a trailing currency, CAD", () => {
  assert.equal(extractPayRange("Hourly Rate $24 - $36 CAD Apply for this job"), "$24 - $36 CAD");
});

test("bare range with no rate or currency", () => {
  assert.equal(
    extractPayRange("Additional Information: Salary Information: $11,250-$13,500 Required Documents"),
    "$11,250-$13,500"
  );
});

test("prize money is not pay: a lone figure with no rate is refused", () => {
  assert.equal(
    extractPayRange("Build. Compete. Win $25,000. Duration: June – August 2026 (3 months)"),
    null
  );
});

test("jQuery in a scraped page is not pay", () => {
  assert.equal(
    extractPayRange(`addBodyBeginMarkerForWidget("jobShowPageApplyButton") $('#apply-button').click(`),
    null
  );
});

test("an RSC payload leaking into scraped text is not pay", () => {
  assert.equal(extractPayRange(`8:["positionId","7623544831999346997","d"]\nf:[]\n0:["$","$L4",null`), null);
});

test("figures too large to be intern pay are refused", () => {
  assert.equal(extractPayRange("annual recurring revenue grew from $1,000,000 - $2,000,000"), null);
});

test("a backwards range is a mis-parse, not a band", () => {
  assert.equal(extractPayRange("some artifact reading $60 - $40"), null);
});

test("no pay information at all", () => {
  assert.equal(extractPayRange("We are looking for a software engineering intern."), null);
  assert.equal(extractPayRange(null), null);
  assert.equal(extractPayRange(""), null);
});
