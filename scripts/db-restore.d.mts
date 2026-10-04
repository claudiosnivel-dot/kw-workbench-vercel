// Tipi di scripts/db-restore.mjs per i test TypeScript (T-604).
type ToolResult = { code: number; stdout: string; stderr: string };

export function isProductionTarget(url: string, productionDbHost: string | undefined): boolean;

export function runRestore(options: {
  argv: string[];
  env?: Record<string, string | undefined>;
  run?: (command: { command: string; args: string[] }, io?: { input?: string; output?: string }) => Promise<ToolResult>;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}): Promise<number>;
