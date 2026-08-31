export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

const CLEARANCE_TRIGGER = /(active\s+)?(security clearance|ts\/sci|top secret)/i;

/** Language that makes a clearance a genuine precondition. Deliberately excludes "obtain" —
 * on its own that word shows up in the *willingness* phrasing vetoed below, not a hard bar. */
const CLEARANCE_CONTEXT = /required|must|active|possess|need to have|currently hold/i;

/** "…or eligibility and willingness to obtain a US Security clearance" is an invitation, not a
 * disqualifier: the posting is open to candidates who don't hold a clearance yet. Palantir and
 * most defense-adjacent employers word it exactly this way, so a window matching this is not
 * treated as a bar even when it also matches CLEARANCE_CONTEXT (these sentences almost always
 * say "Active clearance, OR willingness to obtain" in one breath). Consistent with this
 * module's bias toward letting a borderline posting through. */
const CLEARANCE_WILLINGNESS =
  /(willing(ness)?|abilit(y|ies)|able|eligib(le|ility))\s+(and\s+willingness\s+)?to\s+obtain|or\s+eligibility/i;

const GRAD_DEGREE_TRIGGER =
  /(currently pursuing (a |your )?(master'?s|ph\.?d\.?))|(ph\.?d\.?|master'?s)\s+(candidate|student)/i;

/** Any sign undergraduates are also in scope. A posting that names a graduate degree *alongside*
 * an undergraduate one ("undergrad or Master's student", "hire undergraduate and masters
 * students") isn't graduate-only. */
const UNDERGRAD_SIGNAL = /bachelor|undergrad(uate)?|\bb\.?s\.?\/m\.?s\.?\b/i;

const NEW_GRAD_TRIGGER =
  /\b(recent graduate|already graduated|must have graduated|0[-–]2 years?\s+(of\s+)?experience)\b/i;

/** True if `context` appears within `window` characters on either side of some match of
 * `trigger`. A window that also matches `veto` doesn't count, which lets a caller carve out
 * phrasings where the context word is present but doesn't mean what it usually means. */
function triggerNearContext(
  text: string,
  trigger: RegExp,
  context: RegExp,
  window: number,
  veto?: RegExp
): boolean {
  const globalTrigger = new RegExp(trigger.source, trigger.flags.includes("g") ? trigger.flags : trigger.flags + "g");
  let match: RegExpExecArray | null;
  while ((match = globalTrigger.exec(text)) !== null) {
    const start = Math.max(0, match.index - window);
    const end = Math.min(text.length, match.index + match[0].length + window);
    const slice = text.slice(start, end);
    if (context.test(slice) && !veto?.test(slice)) return true;
    if (globalTrigger.lastIndex === match.index) globalTrigger.lastIndex++; // avoid infinite loop on zero-width matches
  }
  return false;
}

/** Deliberately conservative — a handful of high-confidence disqualifiers, biased toward false
 * negatives (missing some) over false positives (wrongly dropping a good posting), since a
 * failed check removes the posting outright. `text: null` (couldn't be fetched/parsed) is always
 * eligible — unverifiable is not the same as disqualified. */
export function checkEligibility(text: string | null): EligibilityResult {
  if (!text) return { eligible: true };

  if (triggerNearContext(text, CLEARANCE_TRIGGER, CLEARANCE_CONTEXT, 100, CLEARANCE_WILLINGNESS)) {
    return { eligible: false, reason: "security clearance required" };
  }

  if (GRAD_DEGREE_TRIGGER.test(text) && !UNDERGRAD_SIGNAL.test(text)) {
    return { eligible: false, reason: "graduate degree required" };
  }

  if (NEW_GRAD_TRIGGER.test(text)) {
    return { eligible: false, reason: "new-grad / post-graduation role" };
  }

  return { eligible: true };
}
