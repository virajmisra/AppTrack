import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

interface TargetCompanyEntry {
  name: string;
  aliases?: string[];
}

interface TargetCompaniesConfig {
  companies: TargetCompanyEntry[];
}

/** Generic corporate-suffix/filler words stripped after tokenizing, so e.g. "Amazon.com, Inc."
 * and "Amazon" reduce to the same key. */
const GENERIC_SUFFIX_WORDS = new Set([
  "inc", "llc", "corp", "corporation", "co", "ltd", "plc", "the", "llp",
]);

/** Lowercases, strips a trailing parenthetical annotation (e.g. "Hewlett Packard (HP)" or
 * "Occidental Petroleum Corporation (Oxy)" — common on github-feed postings that append a
 * ticker/abbreviation), replaces punctuation that varies across sources (periods, commas,
 * ampersands) with spaces, collapses whitespace, and drops generic corporate-suffix words. Used
 * for exact Set-membership matching — deliberately not substring matching, since that would
 * produce false positives (e.g. "Meta" inside "Metabase"). */
export function normalizeCompanyName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[.,&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned
    .split(" ")
    .filter((word) => word.length > 0 && !GENERIC_SUFFIX_WORDS.has(word))
    .join(" ");
}

export async function loadTargetCompanyNames(): Promise<Set<string>> {
  const filePath = path.join(process.cwd(), "target-companies.json");
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<TargetCompaniesConfig>;

  const names = new Set<string>();
  for (const company of parsed.companies ?? []) {
    names.add(normalizeCompanyName(company.name));
    for (const alias of company.aliases ?? []) {
      names.add(normalizeCompanyName(alias));
    }
  }
  return names;
}

export function isTargetCompany(company: string, targetNames: Set<string>): boolean {
  return targetNames.has(normalizeCompanyName(company));
}
