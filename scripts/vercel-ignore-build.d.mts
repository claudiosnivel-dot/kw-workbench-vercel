// Tipi di scripts/vercel-ignore-build.mjs per i test TypeScript (T-605).
export function shouldSkipBuild(files: string[]): boolean;

export function runIgnoreBuild(options: {
  env: Record<string, string | undefined>;
  diff: (previous: string, current: string) => string[];
  log?: (line: string) => void;
}): number;
