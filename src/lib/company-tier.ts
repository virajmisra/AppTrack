import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeCompanyName } from "./target-companies";
import type { InterviewFit } from "@/types/database";

export type { InterviewFit };

/** A batch of companies sharing a rationale, mirroring how the list is actually maintained: a
 * research pass adds a block of companies and records why they landed in that tier. */
interface TierGroup {
  note?: string;
  companies: string[];
}

interface TierConfig {
  note?: string;
  groups: TierGroup[];
}

type TierKey = "ready_now" | "target" | "reach";

interface CompanyTiersConfig {
  tiers: Record<TierKey, TierConfig>;
}

/** Normalized company names per tier, resolved once per request and passed to `getInterviewFit`. */
export type InterviewFitIndex = Record<TierKey, Set<string>>;

/** The real judgements live in a gitignored file, because they are personal, unflattering-if-
 * misread assessments of named companies' interview processes and this repository is public.
 * `company-tiers.example.json` is the committed stand-in so a fresh clone builds and runs — it
 * just rates almost nothing, which `getInterviewFit` reports honestly as "unrated". */
const TIERS_FILE = "company-tiers.json";
const TIERS_EXAMPLE_FILE = "company-tiers.example.json";

async function readTiersConfig(): Promise<CompanyTiersConfig | null> {
  for (const file of [TIERS_FILE, TIERS_EXAMPLE_FILE]) {
    try {
      const raw = await readFile(path.join(process.cwd(), file), "utf-8");
      return JSON.parse(raw) as CompanyTiersConfig;
    } catch {
      // Missing or unparseable — fall through to the example, then to "nothing is rated".
    }
  }
  return null;
}

const EMPTY_INDEX: InterviewFitIndex = {
  ready_now: new Set(),
  target: new Set(),
  reach: new Set(),
};

export async function loadInterviewFits(): Promise<InterviewFitIndex> {
  const config = await readTiersConfig();
  if (!config?.tiers) return EMPTY_INDEX;

  const index: InterviewFitIndex = {
    ready_now: new Set(),
    target: new Set(),
    reach: new Set(),
  };
  for (const key of Object.keys(index) as TierKey[]) {
    for (const group of config.tiers[key]?.groups ?? []) {
      for (const company of group.companies) {
        index[key].add(normalizeCompanyName(company));
      }
    }
  }
  return index;
}

/** Companies in none of the tiers have no research behind them yet — returning a guessed tier for
 * them would repeat the exact mistake this file was rewritten to fix. "Unrated" isn't a negative
 * signal, just an honest "not researched yet." Extend coverage by researching a company's real
 * interview process (Glassdoor/LeetCode Discuss/Blind/levels.fyi) and adding it to
 * company-tiers.json — OpenAI, Anthropic, Anduril and Neuralink were previously guessed into
 * Reach on reputation alone and were deliberately moved back to unrated for exactly this reason. */
export function getInterviewFit(company: string, index: InterviewFitIndex): InterviewFit {
  const normalized = normalizeCompanyName(company);
  if (index.ready_now.has(normalized)) return "ready_now";
  if (index.target.has(normalized)) return "target";
  if (index.reach.has(normalized)) return "reach";
  return "unrated";
}
