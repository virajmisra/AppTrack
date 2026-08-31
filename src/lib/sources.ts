import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface GreenhouseSource {
  name: string;
  boardToken: string;
  /** Each group is OR'd internally; all groups must have at least one match (AND across groups). */
  requireAllGroups: string[][];
  /** Job is dropped if any of these keywords appear in the title. */
  excludeAny: string[];
}

/** Lever's public postings API (`api.lever.co/v0/postings/{boardToken}?mode=json`) has the same
 * shape-of-problem as Greenhouse: a token-addressed board, title-keyword screening. */
export interface LeverSource {
  name: string;
  boardToken: string;
  requireAllGroups: string[][];
  excludeAny: string[];
}

interface CategorizedGithubFeedSource {
  name: string;
  url: string;
  schema: "categorized";
  /** Allowlist matched against the feed entry's `category` field. */
  categories: string[];
  /** Job is dropped if any of these keywords appear in the title (category alone doesn't screen out e.g. "PhD Intern"). */
  excludeAny: string[];
}

interface KeywordGithubFeedSource {
  name: string;
  url: string;
  schema: "keyword";
  requireAllGroups: string[][];
  excludeAny: string[];
}

export type GithubFeedSource = CategorizedGithubFeedSource | KeywordGithubFeedSource;

interface SourcesConfig {
  greenhouse: GreenhouseSource[];
  lever: LeverSource[];
  githubFeeds: GithubFeedSource[];
}

export async function loadSources(): Promise<SourcesConfig> {
  const filePath = path.join(process.cwd(), "sources.json");
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<SourcesConfig>;

  return {
    greenhouse: parsed.greenhouse ?? [],
    lever: parsed.lever ?? [],
    githubFeeds: parsed.githubFeeds ?? [],
  };
}
