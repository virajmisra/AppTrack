export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

const CLEARANCE_TRIGGER = /(active\s+)?(security clearance|ts\/sci|top secret)/i;
const CLEARANCE_CONTEXT = /required|must|active|obtain|possess|need to have/i;

const GRAD_DEGREE_TRIGGER =
  /(currently pursuing (a |your )?(master'?s|ph\.?d\.?))|(ph\.?d\.?|master'?s)\s+(candidate|student)/i;

const NEW_GRAD_TRIGGER =
  /\b(recent graduate|already graduated|must have graduated|0[-–]2 years?\s+(of\s+)?experience)\b/i;

/** True if `context` appears within `window` characters on either side of every match of `trigger`. */
function triggerNearContext(text: string, trigger: RegExp, context: RegExp, window: number): boolean {
  const globalTrigger = new RegExp(trigger.source, trigger.flags.includes("g") ? trigger.flags : trigger.flags + "g");
  let match: RegExpExecArray | null;
  while ((match = globalTrigger.exec(text)) !== null) {
    const start = Math.max(0, match.index - window);
    const end = Math.min(text.length, match.index + match[0].length + window);
    if (context.test(text.slice(start, end))) return true;
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

  if (triggerNearContext(text, CLEARANCE_TRIGGER, CLEARANCE_CONTEXT, 100)) {
    return { eligible: false, reason: "security clearance required" };
  }

  if (GRAD_DEGREE_TRIGGER.test(text) && !/bachelor/i.test(text)) {
    return { eligible: false, reason: "graduate degree required" };
  }

  if (NEW_GRAD_TRIGGER.test(text)) {
    return { eligible: false, reason: "new-grad / post-graduation role" };
  }

  return { eligible: true };
}
