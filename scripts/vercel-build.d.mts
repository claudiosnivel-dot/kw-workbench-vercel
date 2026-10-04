// Tipi di scripts/vercel-build.mjs per i test TypeScript (T-202).
export type DbIdentity = { hostname: string; username: string | null };

export type MigrationDecision = { migrate: boolean; reason: string };

export function dbIdentity(url: string | undefined): DbIdentity | null;

export function sameDatabase(target: DbIdentity, reference: DbIdentity): boolean;

export function decideMigration(env: {
  VERCEL_ENV?: string;
  DIRECT_URL?: string;
  PRODUCTION_DB_HOST?: string;
}): MigrationDecision;

export function runVercelBuild(options: {
  env: Record<string, string | undefined>;
  run: (argv: string[]) => number | Promise<number>;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}): Promise<number>;
