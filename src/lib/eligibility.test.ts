import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEligibility } from "./eligibility.ts";

// Run with: npm test   (node --test --experimental-strip-types)
//
// Fixtures are real posting descriptions pulled from the `postings` table (trimmed to the
// sentences the rules actually key on). They exist because both rules here previously fired on
// phrasings that don't disqualify an undergraduate intern: "willingness to obtain a clearance"
// read as "clearance required", and a posting naming a graduate degree alongside an
// undergraduate one read as "graduate degree only". Between them those two false positives were
// hiding 64 of the 169 postings the gate had excluded.

test("clearance: 'or eligibility and willingness to obtain' is an invitation, not a bar", () => {
  const r = checkEligibility(
    "Active US Security clearance, or eligibility and willingness to obtain a US Security " +
      "clearance. Engineering background in fields such as Computer Science."
  );
  assert.equal(r.eligible, true);
});

test("clearance: 'Ability to obtain and maintain' is not a bar", () => {
  const r = checkEligibility(
    "Ability to obtain and maintain a U.S. Security Clearance. Must be legally authorized to " +
      "work in the United States without the need for employer sponsorship."
  );
  assert.equal(r.eligible, true);
});

test("clearance: a later 'may be required to start' mention still disqualifies", () => {
  // Verbatim from a Northrop Grumman intern posting. The first mention is willingness phrasing
  // and is vetoed; the second, far enough away to be its own window, is a real precondition.
  const r = checkEligibility(
    "Be able to obtain and maintain a U.S. Government security clearance (U.S. citizenship is " +
      "a pre-requisite) as well as Program Special access within a reasonable period of time, as " +
      "determined by the company to meet its business needs (U.S. citizenship is a pre-requisite). " +
      "Final approved U.S. Government security clearance (U.S. citizenship is a pre-requisite) as " +
      "well as Program Special Access may be required to start."
  );
  assert.equal(r.eligible, false);
  assert.equal(r.reason, "security clearance required");
});

test("clearance: holding an active clearance up front still disqualifies", () => {
  const r = checkEligibility("Applicants must currently hold an active TS/SCI clearance with polygraph.");
  assert.equal(r.eligible, false);
  assert.equal(r.reason, "security clearance required");
});

test("grad degree: 'undergrad or a PhD student' keeps undergraduates in scope", () => {
  const r = checkEligibility(
    "Whether you're an undergrad or a PhD student, your contributions matter. 2027 Undergrad " +
      "Data Analyst Intern/co-op."
  );
  assert.equal(r.eligible, true);
});

test("grad degree: 'An undergraduate or PhD student' keeps undergraduates in scope", () => {
  const r = checkEligibility(
    "You should be: An undergraduate or PhD student with practical experience training an ML model."
  );
  assert.equal(r.eligible, true);
});

test("grad degree: 'undergraduate and masters students' keeps undergraduates in scope", () => {
  const r = checkEligibility(
    "The Department of Statistics seeks to hire undergraduate and masters students as part-time " +
      "Research Assistants."
  );
  assert.equal(r.eligible, true);
});

test("grad degree: a bachelor's mention anywhere keeps the posting", () => {
  const r = checkEligibility(
    "Currently pursuing a Master's degree. Enrolled in an accredited university pursuing a " +
      "bachelor's degree or higher in Computer Science."
  );
  assert.equal(r.eligible, true);
});

test("grad degree: PhD-only postings are still excluded", () => {
  const r = checkEligibility(
    "Qualifications. Must Have: Currently enrolled PhD student in Computer Science, Machine " +
      "Learning, Artificial Intelligence, Computer Engineering, Mathematics or a related field."
  );
  assert.equal(r.eligible, false);
  assert.equal(r.reason, "graduate degree required");
});

test("new-grad postings are still excluded", () => {
  const r = checkEligibility("We are looking for a recent graduate to join the team full-time.");
  assert.equal(r.eligible, false);
  assert.equal(r.reason, "new-grad / post-graduation role");
});

test("an unverifiable description is never treated as disqualified", () => {
  assert.equal(checkEligibility(null).eligible, true);
});
