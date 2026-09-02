/** Pay text extraction from a posting description.
 *
 * Deliberately lexical rather than a judgement call: this is finding a currency literal in cached
 * text during an unattended sync, not interpreting what a sentence means, and there is no LLM in
 * the sync path to defer to. The rules below are kept narrow and bounded for that reason — they
 * recognise how compensation is actually written, and refuse anything they can't place.
 *
 * Output is display-only and verbatim (whitespace collapsed). It is never parsed back into
 * numbers, so "$44 - $63 USD" and "$10,000/month" are both fine to show as-is.
 */

/** A dollar figure: "$44", "$10,000", "$27.00". */
const AMOUNT = String.raw`\$\s?\d[\d,]*(?:\.\d{1,2})?`;

/** Currency suffix some boards append after the figure ("$44 - $63 USD"). */
const CURRENCY = String.raw`(?:\s*(?:USD|CAD))?`;

/** How often the figure is paid. Required for a lone figure — see PAY_PATTERN. */
const RATE = String.raw`(?:\s*\/\s*(?:hour|hr|month|mo|year|yr)|\s+per\s+(?:hour|hr|month|year|annum)|\s+an?\s+(?:hour|month|year)|\s*(?:hourly|monthly|annually))`;

/** Either a range, or a single figure that carries an explicit rate.
 *
 * The rate is mandatory on a lone figure because a bare amount in a job description is far more
 * often something else — "Build. Compete. Win $25,000." is a prize, not the pay. A range is
 * accepted without one since two figures joined by a dash is already a strong pay signal. */
const PAY_PATTERN = new RegExp(
  `(?:${AMOUNT}\\s*(?:-|–|—|to)\\s*${AMOUNT}${CURRENCY}${RATE}?)|(?:${AMOUNT}${CURRENCY}${RATE})`,
  "gi"
);

/** Intern pay lives well inside this. The upper bound is what rejects revenue, funding and
 * contract-value figures that would otherwise read as a valid range ("$1,000,000 - $2,000,000"). */
const MIN_PLAUSIBLE = 1;
const MAX_PLAUSIBLE = 500_000;

function amountsIn(candidate: string): number[] {
  return [...candidate.matchAll(new RegExp(AMOUNT, "g"))].map((m) =>
    Number(m[0].replace(/[$,\s]/g, ""))
  );
}

function isPlausible(candidate: string): boolean {
  const amounts = amountsIn(candidate);
  if (amounts.length === 0) return false;
  if (amounts.some((n) => !Number.isFinite(n) || n < MIN_PLAUSIBLE || n > MAX_PLAUSIBLE)) {
    return false;
  }
  // A range that runs backwards ("$60 - $40") is a mis-parse, not a pay band.
  if (amounts.length === 2 && amounts[0] > amounts[1]) return false;
  return true;
}

/** First plausible pay figure in `text`, verbatim with whitespace collapsed, or null.
 *
 * Takes PLAIN TEXT, not HTML — callers holding markup should `stripHtml` first. That keeps this
 * usable both at fetch time (from an adapter's own payload) and during the sync's enrichment pass
 * (from the already-extracted `description_text`), which is where GitHub-feed postings get theirs. */
export function extractPayRange(text: string | null | undefined): string | null {
  if (!text) return null;

  for (const match of text.matchAll(PAY_PATTERN)) {
    const candidate = match[0].replace(/\s+/g, " ").trim();
    if (isPlausible(candidate)) return candidate;
  }
  return null;
}
