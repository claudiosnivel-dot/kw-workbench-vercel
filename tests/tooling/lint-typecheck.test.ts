import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

const COMMAND_TIMEOUT_MS = 240_000;

/** Esegue un comando nella radice del repo con stdin chiuso: un prompt interattivo non riceverebbe input. */
function run(command: string): SpawnSyncReturns<string> {
  return spawnSync(command, {
    shell: true,
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: COMMAND_TIMEOUT_MS,
  });
}

describe("lint e typecheck come comandi", () => {
  let lint: SpawnSyncReturns<string>;
  let typecheck: SpawnSyncReturns<string>;

  beforeAll(() => {
    lint = run("npm run lint");
    typecheck = run("npm run typecheck");
  }, 2 * COMMAND_TIMEOUT_MS);

  // covers: AC-102-1
  it("npm run lint e npm run typecheck escono con 0 senza richieste interattive", () => {
    expect(lint.error).toBeUndefined();
    expect(lint.status, lint.stdout + lint.stderr).toBe(0);
    expect(typecheck.error).toBeUndefined();
    expect(typecheck.status, typecheck.stdout + typecheck.stderr).toBe(0);
  });

  // covers: AC-102-2
  it("la fixture con un hook dentro un if viola react-hooks/rules-of-hooks", () => {
    const result = run("npx eslint --no-ignore tests/fixtures/tooling/lint-violation.tsx");

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("react-hooks/rules-of-hooks");
  }, COMMAND_TIMEOUT_MS);

  // covers: AC-102-3
  it("la fixture con un errore di tipo fa fallire tsc con TS2322", () => {
    const result = run("npx tsc --noEmit -p tests/fixtures/tooling/tsconfig.json");

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("TS2322");
  }, COMMAND_TIMEOUT_MS);

  // covers: AC-102-4
  it("dopo il typecheck tsconfig.tsbuildinfo è ignorato da git", () => {
    const status = run("git status --porcelain");
    const checkIgnore = run("git check-ignore tsconfig.tsbuildinfo");

    expect(status.status).toBe(0);
    expect(status.stdout.split("\n").filter((line) => line.includes("tsconfig.tsbuildinfo"))).toEqual([]);
    expect(checkIgnore.status).toBe(0);
  });
});
