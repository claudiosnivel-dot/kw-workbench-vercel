import { canonicalizeKeyword, normalizeKeyword } from "@/lib/modules/normalization";

export type RawKeywordCandidate = {
  keyword: string;
  source: string;
  sourceQuery: string;
};

export type DedupedCandidate = RawKeywordCandidate & {
  normalizedKeyword: string;
  canonicalKeyword: string;
};

export function dedupeCandidates(input: RawKeywordCandidate[]): DedupedCandidate[] {
  const seen = new Set<string>();
  const output: DedupedCandidate[] = [];

  for (const item of input) {
    const normalizedKeyword = normalizeKeyword(item.keyword);
    const canonicalKeyword = canonicalizeKeyword(item.keyword);

    if (!normalizedKeyword || !canonicalKeyword || seen.has(canonicalKeyword)) {
      continue;
    }

    seen.add(canonicalKeyword);
    output.push({
      ...item,
      normalizedKeyword,
      canonicalKeyword,
    });
  }

  return output;
}
