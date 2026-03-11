export function buildExpansionQueries(params: {
  seeds: string[];
  expandAlpha: boolean;
  expandNumeric: boolean;
  expandPatterns: boolean;
  patterns: string[];
}): string[] {
  const { seeds, expandAlpha, expandNumeric, expandPatterns, patterns } = params;
  const output = new Set<string>();

  for (const seed of seeds) {
    output.add(seed);

    if (expandAlpha) {
      for (let code = 97; code <= 122; code += 1) {
        output.add(`${seed} ${String.fromCharCode(code)}`);
      }
    }

    if (expandNumeric) {
      for (let n = 0; n <= 9; n += 1) {
        output.add(`${seed} ${n}`);
      }
    }

    if (expandPatterns) {
      for (const pattern of patterns) {
        output.add(pattern.replaceAll("{seed}", seed));
      }
    }
  }

  return Array.from(output);
}
