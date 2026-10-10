import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Il test interroga il registry npm (npm audit): gira nel job checks della CI (T-110).
const COMMAND_TIMEOUT_MS = 180_000;
const TASK_ID = /^T-\d{3,4}$/;

type AllowlistEntry = { ghsa: string; package: string; reason: string; closedBy: string[] };
type LsNode = { version?: string; invalid?: string; missing?: boolean };
type LsOutput = { dependencies?: Record<string, LsNode>; problems?: string[] };
type AuditVia = string | { name: string; severity: string; url: string };
type AuditOutput = {
  metadata: { vulnerabilities: Record<string, number> };
  vulnerabilities: Record<string, { via: AuditVia[] }>;
};

function run(command: string): SpawnSyncReturns<string> {
  return spawnSync(command, {
    shell: true,
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8")) as T;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { recursive: true, encoding: "utf8" })
    .map((file) => join(dir, file))
    .filter((file) => /\.(ts|tsx|mjs|js)$/.test(file) && statSync(join(process.cwd(), file)).isFile())
    .filter((file) => !file.replace(/\\/g, "/").startsWith("lib/generated/"));
}

/** Advisory high dell'albero, per id GHSA, con i pacchetti che le dichiarano direttamente. */
function highAdvisories(audit: AuditOutput): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const vulnerability of Object.values(audit.vulnerabilities)) {
    for (const via of vulnerability.via) {
      if (typeof via === "string" || via.severity !== "high") continue;
      const ghsa = via.url.split("/").pop() ?? via.url;
      found.set(ghsa, (found.get(ghsa) ?? new Set()).add(via.name));
    }
  }
  return found;
}

describe("dipendenze aggiornate e advisory sotto controllo", () => {
  let ls: SpawnSyncReturns<string>;
  let audit: SpawnSyncReturns<string>;

  beforeAll(() => {
    ls = run("npm ls next react react-dom --json");
    audit = run("npm audit --json");
  }, 2 * COMMAND_TIMEOUT_MS);

  // covers: AC-401-1
  // impacted-by: T-404 (next 15.5.27 era la patch sul ramo 15; dal macrotask 04 next è 16.3.x).
  it("npm ls riporta next 16.3.x e react/react-dom 19.3.x senza dipendenze invalid o missing", () => {
    expect(ls.error).toBeUndefined();
    expect(ls.status, ls.stderr).toBe(0);
    const tree = JSON.parse(ls.stdout) as LsOutput;
    expect(tree.problems ?? []).toEqual([]);
    expect(ls.stdout).not.toMatch(/"(invalid|missing)"/);
    expect(tree.dependencies?.next?.version).toMatch(/^16\.3\.\d+$/);
    expect(tree.dependencies?.react?.version).toMatch(/^19\.3\.\d+$/);
    expect(tree.dependencies?.["react-dom"]?.version).toMatch(/^19\.3\.\d+$/);

    const pkg = readJson<{ dependencies: Record<string, string> }>("package.json");
    expect(pkg.dependencies.next).toMatch(/^16\.3\.\d+$/);
  });

  // covers: AC-401-2
  // covers: AC-1907-4
  it("npm audit non ha critical e ogni advisory high è nell'allowlist con un task di chiusura", () => {
    expect(audit.error).toBeUndefined();
    const report = JSON.parse(audit.stdout) as AuditOutput;
    expect(report.metadata.vulnerabilities.critical).toBe(0);

    const allowlist = readJson<AllowlistEntry[]>("tests/tooling/audit-allowlist.json");
    for (const entry of allowlist) {
      expect(entry.reason.trim().length, entry.ghsa).toBeGreaterThan(0);
      expect(entry.closedBy.length, entry.ghsa).toBeGreaterThan(0);
      for (const task of entry.closedBy) expect(task, entry.ghsa).toMatch(TASK_ID);
    }

    const allowed = new Map(allowlist.map((entry) => [entry.ghsa, entry.package]));
    const unlisted = [...highAdvisories(report)]
      .filter(([ghsa, packages]) => !packages.has(allowed.get(ghsa) ?? ""))
      .map(([ghsa, packages]) => `${ghsa} (${[...packages].join(", ")})`);
    expect(unlisted).toEqual([]);
  });

  // covers: AC-1907-4
  it("@react-pdf/renderer è nel lockfile alla versione esatta dichiarata in package.json (D-34)", () => {
    const pkg = readJson<{ dependencies: Record<string, string> }>("package.json");
    const lock = readJson<{ packages: Record<string, { version?: string }> }>("package-lock.json");
    const declared = pkg.dependencies["@react-pdf/renderer"];

    expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lock.packages["node_modules/@react-pdf/renderer"]?.version).toBe(declared);
  });

  // Ogni voce scade con il task che la chiude: una voce non più riportata va tolta.
  it("l'allowlist non contiene advisory che npm audit non riporta più", () => {
    const report = JSON.parse(audit.stdout) as AuditOutput;
    const reported = highAdvisories(report);
    const allowlist = readJson<AllowlistEntry[]>("tests/tooling/audit-allowlist.json");

    expect(allowlist.filter((entry) => !reported.get(entry.ghsa)?.has(entry.package)).map((e) => e.ghsa)).toEqual([]);
  });

  // covers: AC-406-4
  it("xlsx non è nell'albero delle dipendenze e nessun sorgente lo importa", () => {
    const ls = run("npm ls xlsx --json");
    const tree = JSON.parse(ls.stdout) as LsOutput;
    expect(tree.dependencies ?? {}).not.toHaveProperty("xlsx");
    expect(ls.stdout).not.toContain("\"xlsx\"");

    const importers = ["app", "lib", "components", "prisma", "scripts"]
      .flatMap(sourceFiles)
      .filter((file) =>
        /from\s+["']xlsx["']|require\(\s*["']xlsx["']\s*\)/.test(readFileSync(join(process.cwd(), file), "utf8"))
      );
    expect(importers).toEqual([]);
  }, COMMAND_TIMEOUT_MS);
});
