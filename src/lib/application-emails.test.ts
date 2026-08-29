import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfirmationEmail, type RawEmail } from "./application-emails.ts";

// Run with: npm test   (node --test --experimental-strip-types)
//
// Fixtures are real application-confirmation emails from testing (subject + sender verbatim,
// bodies trimmed to the relevant sentences). They exist to catch regressions in the heuristic
// parser — company/role extraction off free-text email is never going to be perfect, so the
// reconcile pipeline queues low-confidence parses for a one-click confirm rather than trusting
// them. "company" here is the parser's raw guess; reconcile.ts resolves it against
// target-companies.json (so "Iberdrola" -> "Iberdrola Group").

const email = (over: Partial<RawEmail>): RawEmail => ({
  id: "x",
  from: "noreply@example.com",
  subject: "",
  bodyText: "",
  date: "2026-08-20T12:00:00Z",
  ...over,
});

test("Workday: role in body, company from sender slug", () => {
  const r = parseConfirmationEmail(
    email({
      from: "analogdevices@myworkday.com",
      subject: "You've applied to a position at Analog Devices - AI/ML Engineer Intern",
      bodyText:
        "Dear Viraj, We have received your application for the position of AI/ML Engineer Intern and are currently reviewing your experience.",
    })
  );
  assert.ok(r);
  assert.equal(r.company, "Analog Devices");
  assert.equal(r.roleTitle, "AI/ML Engineer Intern");
  assert.equal(r.status, "applied");
  assert.equal(r.confidence, "high");
});

test("Workday: 'role:' phrasing, trailing location trimmed off the title", () => {
  const r = parseConfirmationEmail(
    email({
      from: "mastercard@myworkday.com",
      subject: "Thank you for your application!",
      bodyText:
        "Thank you for your interest in joining Mastercard! We have received your application for the role: Data Engineering Intern, Summer 2027 – St. Louis, MO, US . At Mastercard, our people open new doors.",
    })
  );
  assert.ok(r);
  assert.equal(r.company, "Mastercard");
  assert.equal(r.roleTitle, "Data Engineering Intern, Summer 2027");
});

test("company-hosted sender: name from '…position … at The Hartford'", () => {
  const r = parseConfirmationEmail(
    email({
      from: "myworkday@thehartford.com",
      subject: "Thank You for Your Application!",
      bodyText:
        "Hi Viraj, Thank you for your interest in the Tech & Data Program Summer 2027 - Software Engineer Intern (Columbus) position here at The Hartford.",
    })
  );
  assert.ok(r);
  assert.equal(r.company, "The Hartford");
});

test("Greenhouse: 'applying to X' as the only signal (X really is the company)", () => {
  const r = parseConfirmationEmail(
    email({
      from: "no-reply@us.greenhouse-mail.io",
      subject: "Thank you for applying to BTI360",
      bodyText: "Viraj, Thanks for applying to BTI360. Your application has been received.",
    })
  );
  assert.ok(r);
  assert.equal(r.company, "BTI360");
});

test("subject is 'applying to <Role>' not a company — prefer the 'opportunities with' company", () => {
  const r = parseConfirmationEmail(
    email({
      from: "careers@recruitment.americanexpress.com",
      subject:
        "Thank you for applying to Campus Undergraduate Summer Internship Program - 2027 Software Engineer, Enterprise Technology Services- Sunrise, FL - 26011015",
      bodyText:
        "Thank you for exploring new career opportunities with American Express! Your application for the position of Campus Undergraduate Summer Internship Program - 2027 Software Engineer, Enterprise Technology Services has been received.",
    })
  );
  assert.ok(r);
  assert.equal(r.company, "American Express");
  assert.match(r.roleTitle, /Campus Undergraduate/);
});

test("'apply to <Company> and the <Role> role' — role must not swallow the company", () => {
  const r = parseConfirmationEmail(
    email({
      from: "no-reply@hellosage.com",
      subject: "Thanks for applying to Sage!",
      bodyText:
        "Thank you for taking the time to apply to Sage and the Software Engineering Intern (Edge) – Summer 2027 role.",
    })
  );
  assert.ok(r);
  assert.equal(r.company, "Sage");
  assert.match(r.roleTitle, /^Software Engineering Intern/);
});

test("subject 'Thank you for applying to <Company>!' does not become the role", () => {
  const r = parseConfirmationEmail(
    email({
      from: "ngc@myworkday.com",
      subject: "Thanks for your application to Northrop Grumman",
      bodyText:
        "Dear Viraj, Thank you for applying to Northrop Grumman! We appreciate your interest in joining our team.",
    })
  );
  assert.ok(r);
  assert.equal(r.company, "Northrop Grumman");
  assert.equal(r.roleTitle, "Role unspecified in confirmation email");
});

test("subject capitalisation + 'a role with' phrasing", () => {
  const r = parseConfirmationEmail(
    email({
      from: "noreply@applytojob.com",
      subject: "Thank You for Applying with RJ Lee Group",
      bodyText:
        "Hello Viraj, Thank you for applying for a role with RJ Lee Group. If your skills are a match we will contact you shortly.",
    })
  );
  assert.ok(r);
  assert.equal(r.company, "RJ Lee Group");
});

test("req number stripped from role", () => {
  const r = parseConfirmationEmail(
    email({
      from: "notification@talentacquisition.abbvie.com",
      subject: "AbbVie Application Received - Thank you!",
      bodyText:
        "Dear Viraj, Thank you for applying for the 2027 Business Technology Solutions Intern - Data & Software Engineering (Undergraduate)-R00147803 position at AbbVie.",
    })
  );
  assert.ok(r);
  assert.equal(r.company, "AbbVie");
  assert.equal(
    r.roleTitle,
    "2027 Business Technology Solutions Intern - Data & Software Engineering (Undergraduate)"
  );
});

test("rejection language sets status", () => {
  const r = parseConfirmationEmail(
    email({
      from: "no-reply@us.greenhouse-mail.io",
      subject: "Update on your application to Acme",
      bodyText:
        "Thank you for applying to Acme. After careful review we have decided to move forward with other candidates.",
    })
  );
  assert.ok(r);
  assert.equal(r.status, "rejected");
});

for (const spam of [
  email({
    from: "express@b.express.com",
    subject: "$5 Express Cash | BOGO 50% off the jeans everyone's wearing",
    bodyText: "Find your favorite fit. Shop Now.",
  }),
  email({
    from: "no-reply@leetcode.com",
    subject: "LeetCode Weekly Digest",
    bodyText: "Our Back-to-School promotion is on, 60% off premium.",
  }),
  email({
    from: "contact@autoapplymax.com",
    subject: "Viraj, your 2 free AI credits are still here",
    bodyText: "We saved your spot. Your 2 free AI credits are still untouched.",
  }),
]) {
  test(`ignores non-application mail: ${spam.subject.slice(0, 30)}`, () => {
    assert.equal(parseConfirmationEmail(spam), null);
  });
}
