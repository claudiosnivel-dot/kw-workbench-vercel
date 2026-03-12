import { normalizeDisplayText } from "@/lib/text/encoding";

export function normalizeKeyword(input: string): string {
  return normalizeDisplayText(input)
    .toLowerCase()
    .replace(/[\u2019\u2018']/g, "")
    .replace(/[^\p{L}\p{N}\p{M}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeKeyword(input: string): string {
  const sanitized = normalizeDisplayText(input)
    .normalize("NFKD")
    .replace(/[\p{M}]/gu, "")
    .replace(/\b(the|a|an)\b/g, "");

  return normalizeKeyword(sanitized);
}

export function keywordCleanlinessScore(keyword: string): number {
  const length = keyword.length;
  const hasRepeatingSymbols = /(.)\1{3,}/.test(keyword);
  const symbolNoise = (keyword.match(/[^\p{L}\p{N}\p{M}\s]/gu) || []).length;

  let score = 1;
  if (length < 4 || length > 80) score -= 0.25;
  if (symbolNoise > 2) score -= 0.2;
  if (hasRepeatingSymbols) score -= 0.25;

  return Math.max(0.1, Math.min(score, 1));
}
