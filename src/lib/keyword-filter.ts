function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleMatchesKeyword(title: string, keyword: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
  return pattern.test(title);
}

/** All requireAllGroups must have >=1 match in the title (OR within a group, AND across groups); excludeAny drops the job if any match. */
export function titleMatchesFilters(title: string, requireAllGroups: string[][], excludeAny: string[]): boolean {
  const passesAllGroups = requireAllGroups.every((group) =>
    group.some((keyword) => titleMatchesKeyword(title, keyword))
  );
  if (!passesAllGroups) return false;

  return !excludeAny.some((keyword) => titleMatchesKeyword(title, keyword));
}
