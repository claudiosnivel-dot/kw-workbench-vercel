import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const COMMAND_TIMEOUT_MS = 240_000;

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8")) as T;
}

/** Esegue un comando nella radice del repo con stdin chiuso: un prompt interattivo non riceverebbe input. */
function run(command: string, env: NodeJS.ProcessEnv = process.env): SpawnSyncReturns<string> {
  return spawnSync(command, {
    shell: true,
    cwd: process.cwd(),
    env,
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

  // covers: AC-402-1
  it("tsc è la 6.0 e package.json la fissa senza prefissi", () => {
    const version = run("npx tsc --version");
    const pkg = readJson<{ devDependencies: Record<string, string> }>("package.json");

    expect(version.status, version.stderr).toBe(0);
    expect(version.stdout.trim().startsWith("Version 6.0.")).toBe(true);
    expect(pkg.devDependencies.typescript).toMatch(/^6\.0\.\d+$/);
  }, COMMAND_TIMEOUT_MS);

  // covers: AC-402-2
  it("npm run typecheck esce 0 senza righe error TS", () => {
    const output = typecheck.stdout + typecheck.stderr;

    expect(typecheck.status, output).toBe(0);
    expect(output.split("\n").filter((line) => line.includes("error TS"))).toEqual([]);
  });

  // covers: AC-402-3
  it("tsconfig.json dichiara types con node e non ha ignoreDeprecations né baseUrl", () => {
    const { compilerOptions } = readJson<{ compilerOptions: Record<string, unknown> }>("tsconfig.json");

    expect(compilerOptions.types).toContain("node");
    expect(compilerOptions).not.toHaveProperty("ignoreDeprecations");
    expect(compilerOptions).not.toHaveProperty("baseUrl");
  });

  // covers: AC-402-4
  it("npm run lint e npm ls typescript-eslint escono 0 senza invalid né ERESOLVE", () => {
    // Con eslint-config-next 15 typescript-eslint arriva come @typescript-eslint/*; da Next 16 anche come meta-pacchetto.
    const ls = run("npm ls typescript-eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin");

    for (const result of [lint, ls]) {
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout + result.stderr).not.toMatch(/invalid|ERESOLVE/);
    }
  }, COMMAND_TIMEOUT_MS);

  // covers: AC-404-3
  it("npm ls riporta next 16.3, lint e build escono 0 e package.json non contiene next lint", () => {
    const ls = run("npm ls next --json");
    const tree = JSON.parse(ls.stdout) as { dependencies?: { next?: { version?: string } } };
    expect(ls.status, ls.stderr).toBe(0);
    expect(tree.dependencies?.next?.version).toMatch(/^16\.3\.\d+$/);

    expect(lint.status, lint.stdout + lint.stderr).toBe(0);
    expect(readFileSync(join(process.cwd(), "package.json"), "utf8")).not.toContain("next lint");

    // Segreti fittizi generati a ogni run, come nel job build della CI: mai valori reali.
    const secret = () => randomBytes(24).toString("hex");
    const build = run("npm run build", { ...process.env, APP_SESSION_SECRET: secret(), APP_ENCRYPTION_KEY: secret() });
    expect(build.status, build.stdout.slice(-2000) + build.stderr.slice(-2000)).toBe(0);
  }, 2 * COMMAND_TIMEOUT_MS);
});
