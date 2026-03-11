export function normalizeKeyword(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeKeyword(input: string): string {
  return normalizeKeyword(
    input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\b(the|a|an)\b/g, "")
  );
}

export function keywordCleanlinessScore(keyword: string): number {
  const length = keyword.length;
  const hasRepeatingSymbols = /(.)\1{3,}/.test(keyword);
  const symbolNoise = (keyword.match(/[^a-zA-Z0-9\s]/g) || []).length;

  let score = 1;
  if (length < 4 || length > 80) score -= 0.25;
  if (symbolNoise > 2) score -= 0.2;
  if (hasRepeatingSymbols) score -= 0.25;

  return Math.max(0.1, Math.min(score, 1));
}
