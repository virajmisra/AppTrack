const SEASON_RANK: Record<string, number> = {
  winter: 0,
  spring: 1,
  summer: 2,
  fall: 3,
};

interface ParsedTerm {
  year: number;
  seasonRank: number;
}

/** Parses "Spring 2027", "Summer 2026", etc. Returns null for unparseable strings like "N/A". */
function parseTerm(term: string): ParsedTerm | null {
  const match = term.trim().match(/^(winter|spring|summer|fall)\s+(\d{4})$/i);
  if (!match) return null;

  const season = match[1].toLowerCase();
  const year = Number(match[2]);
  return { year, seasonRank: SEASON_RANK[season] };
}

function currentTerm(now: Date): ParsedTerm {
  const month = now.getMonth(); // 0-11
  let seasonRank: number;
  if (month <= 1 || month === 11) seasonRank = SEASON_RANK.winter; // Dec, Jan, Feb
  else if (month <= 4) seasonRank = SEASON_RANK.spring; // Mar-May
  else if (month <= 7) seasonRank = SEASON_RANK.summer; // Jun-Aug
  else seasonRank = SEASON_RANK.fall; // Sep-Nov

  const year = month === 11 ? now.getFullYear() + 1 : now.getFullYear();
  return { year, seasonRank };
}

/** True if `term` (e.g. "Summer 2027") is the current term or later. Unparseable terms return true (benefit of the doubt). */
export function isFutureOrCurrentTerm(term: string, now: Date = new Date()): boolean {
  const parsed = parseTerm(term);
  if (!parsed) return true;

  const current = currentTerm(now);
  if (parsed.year !== current.year) return parsed.year > current.year;
  return parsed.seasonRank >= current.seasonRank;
}
