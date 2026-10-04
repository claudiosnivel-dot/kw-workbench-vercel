import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readFileSync } from "node:fs";
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
  it("npm ls riporta next 15.5.27 e react/react-dom 19.3.x senza dipendenze invalid o missing", () => {
    expect(ls.error).toBeUndefined();
    expect(ls.status, ls.stderr).toBe(0);
    const tree = JSON.parse(ls.stdout) as LsOutput;
    expect(tree.problems ?? []).toEqual([]);
    expect(ls.stdout).not.toMatch(/"(invalid|missing)"/);
    expect(tree.dependencies?.next?.version).toBe("15.5.27");
    expect(tree.dependencies?.react?.version).toMatch(/^19\.3\.\d+$/);
    expect(tree.dependencies?.["react-dom"]?.version).toMatch(/^19\.3\.\d+$/);

    const pkg = readJson<{ dependencies: Record<string, string> }>("package.json");
    expect(pkg.dependencies.next).toBe("15.5.27");
  });

  // covers: AC-401-2
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

  // Ogni voce scade con il task che la chiude: una voce non più riportata va tolta.
  it("l'allowlist non contiene advisory che npm audit non riporta più", () => {
    const report = JSON.parse(audit.stdout) as AuditOutput;
    const reported = highAdvisories(report);
    const allowlist = readJson<AllowlistEntry[]>("tests/tooling/audit-allowlist.json");

    expect(allowlist.filter((entry) => !reported.get(entry.ghsa)?.has(entry.package)).map((e) => e.ghsa)).toEqual([]);
  });
});
