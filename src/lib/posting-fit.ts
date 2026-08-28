import { titleMatchesFilters } from "./keyword-filter";
import { isTargetCompany } from "./target-companies";

/** Title must contain at least one of these — matches a resume with real SWE full-stack and
 * AI/LLM/data pipeline experience but no PM/design background. Needed because the Simplify
 * feed's "Product"/"Software"/etc. categories aren't screened by title at all, so non-technical
 * titles (e.g. "Client Solutions Intern", "Product Operations Intern") can otherwise pass
 * through untouched. */
const TECHNICAL_ROLE_KEYWORDS = [
  "software engineer",
  "software engineering",
  "swe",
  "full stack",
  "frontend",
  "front end",
  "backend",
  "back end",
  "platform engineer",
  "systems engineer",
  "infrastructure engineer",
  "site reliability",
  "machine learning",
  "ml engineer",
  "ai engineer",
  "artificial intelligence",
  "applied scientist",
  "research engineer",
  "data engineer",
  "data scientist",
  "data science",
];

/** Titles signaling a PM/program-management/design/analyst track rather than SWE/ML/data
 * engineering. Needed because ingestion (sources.json) intentionally lets these through — its
 * requireAllGroups accept "product manager"/"apm" — so this is a second line of defense in case
 * a PM-track title happens to also contain a technical keyword above (e.g. "Technical Program
 * Manager, Software"). */
const NON_TECHNICAL_ROLE_KEYWORDS = [
  "product manager",
  "product management",
  "associate product manager",
  "apm",
  "technical program manager",
  "program manager",
  "business analyst",
  "product analyst",
  "product design",
  "ux designer",
  "ui designer",
];

/** Signals of a software/technical role in a job description, used only to disambiguate a title
 * that matched neither TECHNICAL_ROLE_KEYWORDS nor NON_TECHNICAL_ROLE_KEYWORDS — e.g. a bare
 * "Engineering Intern" at a software company (GlossGenius) that never says "software" in the
 * title itself. Deliberately looser than the title keywords since description text has more room
 * to be specific. */
const TECHNICAL_DESCRIPTION_KEYWORDS = [
  "software",
  "codebase",
  "coding",
  "programming",
  "computer science",
  "algorithms",
  "apis",
  "distributed systems",
  "cloud infrastructure",
  "ci/cd",
  "unit tests",
  "python",
  "javascript",
  "typescript",
  "kubernetes",
  "microservices",
  "sql",
  "react",
  "node.js",
];

/** Signals of a non-software engineering discipline, so a bare "Engineering Intern" at an
 * industrial/hardware/aerospace company isn't swept in just because its description happens to
 * use an unrelated technical-sounding word. */
const NON_TECHNICAL_DESCRIPTION_KEYWORDS = [
  "mechanical engineering",
  "electrical engineering",
  "civil engineering",
  "chemical engineering",
  "industrial engineering",
  "manufacturing process",
  "circuit design",
  "thermodynamics",
  "structural analysis",
  "materials science",
  "process engineering",
  "quality engineering",
];

function descriptionSuggestsTechnicalRole(description: string): boolean {
  const lower = description.toLowerCase();
  if (NON_TECHNICAL_DESCRIPTION_KEYWORDS.some((kw) => lower.includes(kw))) return false;
  return TECHNICAL_DESCRIPTION_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isTechnicalRole(title: string, descriptionText?: string | null): boolean {
  if (titleMatchesFilters(title, [TECHNICAL_ROLE_KEYWORDS], NON_TECHNICAL_ROLE_KEYWORDS)) {
    return true;
  }
  // Title alone was ambiguous (matched neither list). If it explicitly matched a non-technical
  // keyword, that's a real negative signal — don't let the description override it. Otherwise
  // (a bare, uninformative title like "Engineering Intern") fall back to the description.
  const titleExplicitlyNonTechnical = titleMatchesFilters(title, [NON_TECHNICAL_ROLE_KEYWORDS], []);
  if (titleExplicitlyNonTechnical || !descriptionText) return false;
  return descriptionSuggestsTechnicalRole(descriptionText);
}

export function postingFitsGoals(
  posting: { company: string; title: string; description_text?: string | null },
  targetCompanyNames: Set<string>
): boolean {
  return (
    isTargetCompany(posting.company, targetCompanyNames) &&
    isTechnicalRole(posting.title, posting.description_text)
  );
}
