import type { ApplicationStatus } from "@/types/database";

/** One inbound email, as handed to the reconcile pipeline. `bodyText` is the plain-text body
 * (the Gmail tool returns it directly, or an HTML→text conversion). */
export interface RawEmail {
  id: string;
  from: string;
  subject: string;
  bodyText: string;
  /** ISO timestamp the email was received. */
  date: string;
}

export interface ParsedApplicationEmail {
  emailId: string;
  /** Best-guess company name. May be a raw ATS slug ("analogdevices") — the reconcile step
   * resolves it against target-companies.json. */
  company: string;
  /** Raw sender slug for Workday-style `<slug>@myworkday.com` mail, so reconcile can fuzzy-match
   * it to a canonical name even when the slug has no spaces. Null otherwise. */
  companySlug: string | null;
  roleTitle: string;
  jobUrl: string | null;
  status: ApplicationStatus;
  appliedOn: string; // yyyy-mm-dd
  /** "high": known ATS/company sender + unambiguous confirmation phrasing + a real role, and the
   * company came from the email text (not just a bare sender slug). "low": one of those is
   * missing — the reconcile step queues it for a one-click confirm. */
  confidence: "high" | "low";
  subject: string;
}

/** Third-party recruiting platforms. Mail from these is almost always transactional (a real
 * application event); the sending domain tells us nothing about which company. */
const ATS_MAIL_DOMAINS = [
  "greenhouse-mail.io", "greenhouse.io", "myworkday.com", "myworkdayjobs.com",
  "myworkdaysite.com", "ashbyhq.com", "lever.co", "hire.lever.co", "icims.com",
  "talent.icims.com", "smartrecruiters.com", "successfactors.com", "successfactors.eu",
  "jobvite.com", "applytojob.com", "bamboohr.com", "app.bamboohr.com", "taleo.net",
  "eightfold.ai", "pymetrics.com", "hackerrank.com", "codesignal.com", "hirevue.com",
  "modernhire.com", "recruitment.americanexpress.com",
];

/** Marketing / newsletter phrases — a hard exclude even if the subject contains "application". */
const MARKETING_MARKERS = [
  "% off", "shop now", "buy one", "bogo", "limited time", "deal ends", "coupon",
  "promo code", "weekly digest", "unsubscribe from all", "black friday", "cyber monday",
  "free ai credits", "we saved your spot",
];

/** Subject/body phrases that confirm an application was *received*. */
const CONFIRMATION_MARKERS = [
  "thank you for applying", "thanks for applying", "thank you for your application",
  "thank you for your interest", "we received your application", "we have received your application",
  "we've received your application", "application has been received", "application received",
  "your application for", "your application to", "you have applied", "you've applied",
  "your recent job application", "thank you for submitting your application",
  "application confirmation", "we appreciate your interest", "successfully received your application",
  "received your resume", "thank you for applying at", "thank you for applying with",
  "thank you for exploring new career opportunities",
];

/** Strong rejection language. Deliberately narrow — a false "rejected" is worse than a stale
 * "applied". */
const REJECTION_MARKERS = [
  "decided to move forward with other candidates", "move forward with other applicants",
  "will not be moving forward", "not be moving forward with your application",
  "we will not be proceeding", "not be proceeding with your application",
  "decided not to move forward", "pursue other candidates", "regret to inform you",
  "unfortunately, we have decided", "unfortunately we will not", "not selected for this",
  "no longer under consideration", "chosen to move forward with other",
  "we have decided to pursue other",
];

const ASSESSMENT_MARKERS = [
  "online assessment", "coding assessment", "hackerrank", "codesignal",
  "complete the following assessment", "invitation to complete", "pymetrics",
  "invitation to pymetrics", "complete our", "take-home",
];

const INTERVIEW_MARKERS = [
  "schedule your interview", "invite you to interview", "interview invitation",
  "would like to schedule a", "phone screen", "recruiter call", "set up a time to chat",
];

function emailDomain(from: string): string {
  const match = from.match(/@([^\s>]+)/);
  return match ? match[1].toLowerCase().replace(/^mail\./, "") : "";
}

function emailLocalPart(from: string): string {
  const match = from.match(/([^\s<@]+)@/);
  return match ? match[1].toLowerCase() : "";
}

function isAtsSender(from: string): boolean {
  const domain = emailDomain(from);
  return ATS_MAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function containsAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

function titleizeToken(token: string): string {
  return token
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

const GENERIC_SENDER_LOCALPARTS = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "notification", "notifications",
  "careers", "recruiting", "recruitment", "talent", "talentacquisition", "jobs", "hr",
  "people", "mail", "info", "hello", "team", "us", "na", "autoreply", "no-reply+autoreply",
]);

const COMPANY_DOMAIN_STOPWORDS = new Set([
  "com", "org", "net", "io", "co", "inc", "careers", "jobs", "email", "mail", "people",
  "myworkday", "hr", "recruiting", "talent", "talentacquisition", "app", "us",
]);

/** Raw `<slug>@myworkday.com` sender slug, if that's what this is. */
function workdaySlug(from: string): string | null {
  if (emailDomain(from) !== "myworkday.com") return null;
  const local = emailLocalPart(from);
  return local && !GENERIC_SENDER_LOCALPARTS.has(local) ? local : null;
}

/** Company derived from the sender when it's a company-hosted mailbox (tesla.com, honeywell.com,
 * grainger.com…). Returns null for third-party ATS domains and for company-hosted mail where the
 * greeting/body clearly names the company itself (handled by companyFromText). */
function companyFromSenderDomain(from: string): string | null {
  if (isAtsSender(from)) return null;
  const domain = emailDomain(from);
  if (!domain) return null;
  const labels = domain.split(".").filter((l) => !COMPANY_DOMAIN_STOPWORDS.has(l));
  const candidate = labels.length > 1 ? labels[labels.length - 1] : labels[0];
  if (!candidate || candidate.length < 2) return null;
  // "thehartford" / "americanexpress" style — a text match will usually beat this, so it's only
  // a fallback.
  return titleizeToken(candidate);
}

/** Phrases that introduce the company name, tried in order. The unambiguous ones (a company
 * always follows) come first; the "applying to X" forms — where X is often the *role* — are the
 * last resort. The company is read as the Capitalized Word Phrase immediately after, from the
 * original (cased) text. */
const COMPANY_LEAD_INS = [
  /interest in joining /i,
  /interest in being part of /i,
  /new career opportunities with /i,
  /(?:career )?opportunities (?:with|at) /i,
  /(?:a |your )?career (?:with|at) /i,
  /position (?:here )?at /i,
  /a role with /i,
  /a position (?:with|at) /i,
  /thank(?:s| you) for applying (?:to|with|at) /i,
  /apply(?:ing)? (?:to|with|at) /i,
  /interest in /i,
  /joining /i,
];

const ROLE_WORD_RE =
  /\b(intern|internship|engineer|engineering|developer|analyst|scientist|manager|program|programme|position|role|co-?op|apprentice|apprenticeship|summer|winter|spring|fall)\b/i;

/** Read a company name out of the text after a lead-in phrase: a run of Capitalized tokens
 * (allowing lowercase connectors like "of"/"and" mid-name), stopped before role words, "team",
 * sentence punctuation, or a parenthetical. */
function readCompanyAfter(text: string, leadIn: RegExp): string | null {
  const match = text.match(leadIn);
  if (!match || match.index === undefined) return null;
  const rest = text.slice(match.index + match[0].length);

  // Capitalized-token phrase: first token starts uppercase; a token is letters/digits with
  // optional internal dots ("L.L.C", not a sentence period) or & / ' / -; connectors "of"/"and"/
  // "the" may appear lowercase between tokens.
  const TOKEN = "[A-Z][A-Za-z0-9&'-]*(?:\\.[A-Za-z0-9&'-]+)*";
  const phrase = rest.match(
    new RegExp(`^(${TOKEN}(?:\\s+(?:${TOKEN}|of|and|the))*)`)
  );
  if (!phrase) return null;

  let value = phrase[1]
    .replace(/\s+(?:and|the|our|your|for|to|of|on)$/i, "")
    .replace(/\s+team$/i, "")
    .replace(/[.,!]+$/, "")
    .trim();

  // Trim a trailing role word the phrase ran into ("Sage and the Software Engineering" → "Sage").
  const roleWordAt = value.search(ROLE_WORD_RE);
  if (roleWordAt > 0) value = value.slice(0, roleWordAt).replace(/\s+(?:and|the)$/i, "").trim();

  if (
    value.length < 2 ||
    /^(the|our|your|a|an|this|us|new|new career)$/i.test(value) ||
    ROLE_WORD_RE.test(value)
  ) {
    return null;
  }
  return value;
}

/** Company names embedded in the subject/body. */
function companyFromText(subject: string, body: string): string | null {
  const text = `${subject}. ${body}`;
  for (const leadIn of COMPANY_LEAD_INS) {
    const value = readCompanyAfter(text, leadIn);
    if (value) return value;
  }
  return null;
}

function cleanRole(raw: string): string {
  return raw
    .split("\n")[0]
    .replace(/[)\s]*\(?\b(?:job\s*(?:number|id|req)?|requisition|jr|req)\b\s*[#:]?\s*[\w-]+\)?/gi, "")
    .replace(/[-–—]\s*[A-Za-z]?R?\d[\w-]*\s*$/i, "") // trailing "-R00147803" / "- 39908"
    .replace(/\s*[-–—]\s*\d{3,}\b.*$/, "") // trailing "- 155557 - New York, NY"
    .replace(/\s+[–-]\s+[A-Z][A-Za-z. ]+,\s+[A-Z]{2}(?:,\s*[A-Z]{2,3})?\s*$/, "") // " – St. Louis, MO, US"
    .replace(/\s*[-–—]\s*(?:new york|jersey city|columbus|sunrise)[\w, ]*$/i, "")
    .replace(/^(?:our|the|a|your)\s+/i, "")
    .replace(/\s+(?:role|position|opening)$/i, "")
    .replace(/[!.,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Role/title from the subject or body. `company` is used to reject a match that just re-captured
 * the company name (common when the subject is "Thanks for applying to <Company>!"). */
function roleFromText(subject: string, body: string, company: string): string | null {
  const companyNorm = company.toLowerCase().replace(/[^a-z0-9]/g, "");

  const subjectPatterns: RegExp[] = [
    /applied to a position at .+? [-–] (.+)$/i,
    /your recent job application for (.+)$/i,
    /received your (.+?) application$/i,
    /interest in the (.+?) (?:role|position)/i,
    /applying to(?: the)? (.+?)(?: (?:role|position|internship|program))?!?$/i,
    /application for(?: the)? (.+?)(?: (?:role|position))?!?$/i,
  ];
  const bodyPatterns: RegExp[] = [
    /application for the (?:role|position)(?: of)?:?\s*(.+?)(?:[.\n!?]|\s+[–-]\s)/i,
    /received your application for (?:the position of |the role of )?(.+?)(?:[.\n!?]|\s+[–-]\s|\s+and\b)/i,
    /(?:apply to|applying to) [A-Z][\w&. -]+? and the (.+?)(?:\s+role\b|[.\n!?])/i,
    /(?:apply|applying) (?:to|for)(?: the)? (.+?)(?:\s+position\b|\s+role\b|\s+and for your interest\b|[.\n!?])/i,
    /(?:your )?application for (.+?)(?:\s+and are currently\b|\s+and for your interest\b|[.\n!?])/i,
    /interest in the (.+?)\s+position/i,
    /the (.+?)\s+position\s+(?:here\s+)?at\s+[A-Z]/i,
    /application to (.+?)(?:[.\n!?]|\s+and\b)/i,
    /position(?: of)?:\s*(.+?)[.\n!?]/i,
    /\brole:\s*(.+?)[.\n!?]/i,
  ];

  const candidates: string[] = [];
  for (const p of subjectPatterns) {
    const m = subject.match(p);
    if (m) candidates.push(m[1]);
  }
  for (const p of bodyPatterns) {
    const m = body.match(p);
    if (m) candidates.push(m[1]);
  }

  for (const raw of candidates) {
    const cleaned = cleanRole(raw);
    if (cleaned.length < 3 || cleaned.length > 140 || !/[a-z]/i.test(cleaned)) continue;
    const cleanedNorm = cleaned.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Reject a match that just re-captured the company name (subject "…applying to <Company>!").
    if (
      companyNorm.length > 3 &&
      (cleanedNorm === companyNorm ||
        cleanedNorm.startsWith(companyNorm) ||
        companyNorm.startsWith(cleanedNorm))
    ) {
      continue;
    }
    // Needs a role-ish word unless it's a longer descriptive phrase.
    if (!ROLE_WORD_RE.test(cleaned) && cleaned.split(" ").length <= 3) continue;
    return cleaned;
  }
  return null;
}

function jobUrlFromText(body: string): string | null {
  const urlRe = /https?:\/\/[^\s"'<>)\]]+/g;
  const urls = body.match(urlRe) ?? [];
  const atsHostFragments = [
    "greenhouse.io", "myworkdayjobs.com", "ashbyhq.com", "lever.co", "icims.com",
    "smartrecruiters.com", "successfactors", "eightfold.ai", "jobvite.com",
    "applytojob.com", "workday", "taleo", "bamboohr.com",
  ];
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (
      atsHostFragments.some((h) => lower.includes(h)) &&
      /\bjob|position|career|posting|apply|requisition/.test(lower) &&
      !/search-results|\/blog|hiring-process/.test(lower)
    ) {
      return url.replace(/[.,);]+$/, "");
    }
  }
  return null;
}

function detectStatus(subject: string, body: string): ApplicationStatus {
  const text = `${subject}\n${body}`;
  if (containsAny(text, REJECTION_MARKERS)) return "rejected";
  if (containsAny(text, INTERVIEW_MARKERS)) return "interview";
  if (containsAny(text, ASSESSMENT_MARKERS)) return "oa";
  return "applied";
}

/**
 * Best-effort parse of one email into an application event, or `null` if it isn't one.
 *
 * Conservative: returns `null` unless the email both reads transactional (known ATS/company
 * sender, or an explicit confirmation phrase) and yields a company. A company that's only a bare
 * ATS slug, or a missing role, drops `confidence` to `"low"` so the reconcile step queues the row
 * for a one-click confirm instead of writing it straight through.
 */
export function parseConfirmationEmail(email: RawEmail): ParsedApplicationEmail | null {
  const { subject, bodyText, from } = email;
  const combined = `${subject}\n${bodyText}`;

  if (containsAny(combined, MARKETING_MARKERS)) return null;

  const atsSender = isAtsSender(from);
  const hasConfirmationPhrase = containsAny(combined, CONFIRMATION_MARKERS);
  if (!atsSender && !hasConfirmationPhrase) return null;

  const status = detectStatus(subject, bodyText);
  const slug = workdaySlug(from);

  const fromText = companyFromText(subject, bodyText);
  const fromDomain = companyFromSenderDomain(from);
  const company = fromText ?? fromDomain ?? (slug ? titleizeToken(slug) : null);
  if (!company) return null;

  const roleTitle = roleFromText(subject, bodyText, company);
  const jobUrl = jobUrlFromText(bodyText);
  const appliedOn = (email.date || new Date().toISOString()).slice(0, 10);

  const companyFromEmailText = Boolean(fromText);
  const confidence: "high" | "low" =
    (atsSender || hasConfirmationPhrase) &&
    hasConfirmationPhrase &&
    companyFromEmailText &&
    roleTitle !== null &&
    status === "applied"
      ? "high"
      : "low";

  return {
    emailId: email.id,
    company,
    companySlug: slug,
    roleTitle: roleTitle ?? "Role unspecified in confirmation email",
    jobUrl,
    status,
    appliedOn,
    confidence,
    subject,
  };
}

/** Gmail search query that scopes a fetch to plausible application mail. Callers pass this to the
 * Gmail search tool, then hand the returned messages to `parseConfirmationEmail`. */
export function gmailConfirmationQuery(sinceIso: string): string {
  const sinceDate = sinceIso.slice(0, 10).replace(/-/g, "/");
  return [
    `after:${sinceDate}`,
    "-in:draft -in:sent -category:promotions",
    '(subject:("thank you for applying" OR "thank you for your application" OR "application received"',
    'OR "we received your application" OR "your application" OR "you\'ve applied" OR "job application"',
    'OR "thanks for applying" OR "application confirmation")',
    'OR "we have received your application" OR "thank you for submitting your application")',
  ].join(" ");
}
