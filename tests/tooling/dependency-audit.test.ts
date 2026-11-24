import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Il test interroga il registry npm (npm audit): gira nel job checks della CI (T-110).
const COMMAND_TIMEOUT_MS = 180_000;
const TASK_ID = /^T-\d{3,4}$/;

type AllowlistEntry = { ghsa: string; package: string; reason: string; closedBy: string[] };
type LsNode = { version?: string; invalid?: string; missing?: boolean; dependencies?: Record<string, LsNode> };
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

/** Versioni di un pacchetto in tutto l'albero di npm ls, anche sotto le altre dipendenze. */
function versionsOf(name: string, node: LsNode, found: string[] = []): string[] {
  for (const [child, entry] of Object.entries(node.dependencies ?? {})) {
    if (child === name && entry.version) found.push(entry.version);
    versionsOf(name, entry, found);
  }
  return found;
}

/** true se la versione x.y.z è almeno minimum. */
function atLeast(version: string, minimum: string): boolean {
  const [a, b] = [version, minimum].map((value) => value.split(".").map(Number));
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return true;
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

/** Avvisi high del rapporto che non hanno una voce dell'allowlist con lo stesso GHSA e lo stesso pacchetto. */
function unlistedHighAdvisories(audit: AuditOutput, allowlist: AllowlistEntry[]): string[] {
  const allowed = new Map(allowlist.map((entry) => [entry.ghsa, entry.package]));
  return [...highAdvisories(audit)]
    .filter(([ghsa, packages]) => !packages.has(allowed.get(ghsa) ?? ""))
    .map(([ghsa, packages]) => `${ghsa} (${[...packages].join(", ")})`);
}

/** Id dei task atomici scritti nei moduli del blueprint (righe «- id: T-…» dei blocchi YAML). */
function blueprintTaskIds(): Set<string> {
  const dir = join(process.cwd(), "docs", "blueprint");
  const ids = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => /^\d{2}-.+\.md$/.test(name))) {
    for (const match of readFileSync(join(dir, file), "utf8").matchAll(/^\s*- id: (T-\d{3,4})\s*$/gm)) ids.add(match[1]);
  }
  return ids;
}

/** Sorgenti di app, lib, components, prisma e scripts che importano o richiedono il pacchetto. */
function importersOf(name: string): string[] {
  const pattern = new RegExp(`from\\s+["']${name}["']|(require|import)\\(\\s*["']${name}["']\\s*\\)`);
  return ["app", "lib", "components", "prisma", "scripts"]
    .flatMap(sourceFiles)
    .filter((file) => pattern.test(readFileSync(join(process.cwd(), file), "utf8")));
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
  // impacted-by: T-6001 (D-03 emendata da D-54: next 16.4.x per gli avvisi critical fino alla 16.4.0).
  it("npm ls riporta next 16.4.x e react/react-dom 19.3.x senza dipendenze invalid o missing", () => {
    expect(ls.error).toBeUndefined();
    expect(ls.status, ls.stderr).toBe(0);
    const tree = JSON.parse(ls.stdout) as LsOutput;
    expect(tree.problems ?? []).toEqual([]);
    expect(ls.stdout).not.toMatch(/"(invalid|missing)"/);
    expect(tree.dependencies?.next?.version).toMatch(/^16\.4\.\d+$/);
    expect(tree.dependencies?.react?.version).toMatch(/^19\.3\.\d+$/);
    expect(tree.dependencies?.["react-dom"]?.version).toMatch(/^19\.3\.\d+$/);

    const pkg = readJson<{ dependencies: Record<string, string> }>("package.json");
    expect(pkg.dependencies.next).toMatch(/^16\.4\.\d+$/);
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

    expect(unlistedHighAdvisories(report, allowlist)).toEqual([]);
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

  // covers: AC-5301-1
  it("ogni vite dell'albero è almeno alla 8.3.3, con una sola versione anche sotto vitest", () => {
    const ls = run("npm ls vite --json");
    expect(ls.status, ls.stderr).toBe(0);
    const versions = versionsOf("vite", JSON.parse(ls.stdout) as LsNode);

    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions.filter((version) => !atLeast(version, "8.3.3"))).toEqual([]);
    expect(new Set(versions).size).toBe(1);
    expect(readJson<{ devDependencies: Record<string, string> }>("package.json").devDependencies.vite).toBe(versions[0]);
  }, COMMAND_TIMEOUT_MS);

  // covers: AC-6001-1
  it("next è almeno alla 16.4.3, ogni undici almeno alla 8.12.2 e ogni zod almeno alla 4.6.6", () => {
    const ls = run("npm ls next undici zod --json");
    expect(ls.status, ls.stderr).toBe(0);
    const tree = JSON.parse(ls.stdout) as LsNode;
    const next = tree.dependencies?.next?.version ?? "";
    const undici = versionsOf("undici", tree);
    const zod = versionsOf("zod", tree);

    expect(next).toMatch(/^16\.4\.\d+$/);
    expect(atLeast(next, "16.4.3")).toBe(true);
    expect(undici.length).toBeGreaterThan(0);
    expect(undici.filter((version) => !atLeast(version, "8.12.2"))).toEqual([]);
    expect(zod.length).toBeGreaterThan(0);
    expect(zod.filter((version) => !atLeast(version, "4.6.6"))).toEqual([]);
  }, COMMAND_TIMEOUT_MS);

  // covers: AC-6001-2
  // impacted-by: T-7901 (D-67: l'allowlist può avere voci con un task di chiusura del blueprint, mai per next, undici e zod)
  it("npm audit non ha critical né avvisi per next, undici e zod, e ogni voce dell'allowlist ha un task di chiusura del blueprint", () => {
    const report = JSON.parse(audit.stdout) as AuditOutput;
    const allowlist = readJson<AllowlistEntry[]>("tests/tooling/audit-allowlist.json");
    const tasks = blueprintTaskIds();

    expect(report.metadata.vulnerabilities.critical).toBe(0);
    expect(Object.keys(report.vulnerabilities).filter((name) => ["next", "undici", "zod"].includes(name))).toEqual([]);
    expect(allowlist.filter((entry) => ["next", "undici", "zod"].includes(entry.package)).map((entry) => entry.ghsa)).toEqual([]);
    for (const entry of allowlist) {
      expect(entry.closedBy.length, entry.ghsa).toBeGreaterThan(0);
      expect(entry.closedBy.filter((task) => !tasks.has(task)), entry.ghsa).toEqual([]);
    }
  });

  // covers: AC-7801-1
  it("next è almeno alla 16.4.5, una sola nell'albero, ed eslint-config-next ha la stessa versione anche in package.json", () => {
    const ls = run("npm ls next eslint-config-next --json");
    expect(ls.status, ls.stderr).toBe(0);
    const tree = JSON.parse(ls.stdout) as LsNode;
    const next = tree.dependencies?.next?.version ?? "";
    const pkg = readJson<{ dependencies: Record<string, string>; devDependencies: Record<string, string> }>("package.json");

    expect(next).toMatch(/^16\.4\.\d+$/);
    expect(atLeast(next, "16.4.5")).toBe(true);
    expect(new Set(versionsOf("next", tree))).toEqual(new Set([next]));
    expect(tree.dependencies?.["eslint-config-next"]?.version).toBe(next);
    expect(pkg.dependencies.next).toBe(next);
    expect(pkg.devDependencies["eslint-config-next"]).toBe(next);
  }, COMMAND_TIMEOUT_MS);

  // covers: AC-7801-2
  it("npm audit non riporta next né l'avviso GHSA-mfr8-8qww-v76h", () => {
    const report = JSON.parse(audit.stdout) as AuditOutput;

    expect(Object.keys(report.vulnerabilities)).not.toContain("next");
    expect(audit.stdout).not.toContain("GHSA-mfr8-8qww-v76h");
  });

  // covers: AC-8001-1
  it("next è almeno alla 16.4.6 con eslint-config-next alla stessa versione e @sentry/nextjs ha major 11, fissati in package.json", () => {
    const ls = run("npm ls next eslint-config-next @sentry/nextjs --json");
    expect(ls.error).toBeUndefined();
    expect(ls.status, ls.stderr).toBe(0);
    const tree = JSON.parse(ls.stdout) as LsNode;
    const next = tree.dependencies?.next?.version ?? "";
    const sentry = tree.dependencies?.["@sentry/nextjs"]?.version ?? "";
    const pkg = readJson<{ dependencies: Record<string, string>; devDependencies: Record<string, string> }>("package.json");

    expect(next).toMatch(/^16\.4\.\d+$/);
    expect(atLeast(next, "16.4.6")).toBe(true);
    expect(tree.dependencies?.["eslint-config-next"]?.version).toBe(next);
    expect(sentry).toMatch(/^11\.\d+\.\d+$/);
    expect(pkg.dependencies.next).toBe(next);
    expect(pkg.devDependencies["eslint-config-next"]).toBe(next);
    expect(pkg.dependencies["@sentry/nextjs"]).toBe(sentry);
  }, COMMAND_TIMEOUT_MS);

  // covers: AC-8001-2
  it("npm audit non ha critical né voci per @sentry/nextjs, @sentry/node, @sentry/bundler-plugins, typescript-eslint, @typescript-eslint/* e fast-uri", () => {
    const report = JSON.parse(audit.stdout) as AuditOutput;
    const fixed = ["@sentry/nextjs", "@sentry/node", "@sentry/bundler-plugins", "typescript-eslint", "fast-uri"];

    expect(report.metadata.vulnerabilities.critical).toBe(0);
    expect(Object.keys(report.vulnerabilities).filter((name) => fixed.includes(name) || name.startsWith("@typescript-eslint/"))).toEqual([]);
  });

  // covers: AC-7901-1
  // impacted-by: T-8101 (D-68: GHSA-fc5q-39xc-vjpf ritirato il 2026-11-18, la voce di picomatch è uscita dall'allowlist)
  it("l'avviso ritirato di picomatch non è nel rapporto di npm audit né nell'allowlist", () => {
    const allowlist = readJson<AllowlistEntry[]>("tests/tooling/audit-allowlist.json");

    expect(audit.stdout).not.toContain("GHSA-fc5q-39xc-vjpf");
    expect(allowlist.filter((entry) => entry.ghsa === "GHSA-fc5q-39xc-vjpf" || entry.package === "picomatch")).toEqual([]);
  });

  // covers: AC-7901-2
  it("picomatch non è una dipendenza diretta e nessun sorgente lo importa", () => {
    const pkg = readJson<{ dependencies: Record<string, string>; devDependencies: Record<string, string> }>("package.json");

    expect(Object.keys(pkg.dependencies)).not.toContain("picomatch");
    expect(Object.keys(pkg.devDependencies)).not.toContain("picomatch");
    expect(importersOf("picomatch")).toEqual([]);
  });

  // covers: AC-8101-1
  it("l'avviso high di effect è nell'allowlist con il motivo e la chiusura in T-8002, task del blueprint", () => {
    const report = JSON.parse(audit.stdout) as AuditOutput;
    const allowlist = readJson<AllowlistEntry[]>("tests/tooling/audit-allowlist.json");
    const entry = allowlist.find((item) => item.ghsa === "GHSA-7589-6fvf-x4pw");

    expect(entry).toMatchObject({ package: "effect", closedBy: ["T-8002"] });
    expect(entry?.reason.trim().length).toBeGreaterThan(0);
    expect(blueprintTaskIds().has("T-8002")).toBe(true);
    expect(unlistedHighAdvisories(report, allowlist)).toEqual([]);
  });

  // covers: AC-8101-2
  it("effect non è una dipendenza diretta, nessun sorgente lo importa e ogni effect dell'albero è sotto prisma", () => {
    const pkg = readJson<{ dependencies: Record<string, string>; devDependencies: Record<string, string> }>("package.json");
    const ls = run("npm ls effect --json");
    expect(ls.status, ls.stderr).toBe(0);
    const tree = JSON.parse(ls.stdout) as LsNode;

    expect(Object.keys(pkg.dependencies)).not.toContain("effect");
    expect(Object.keys(pkg.devDependencies)).not.toContain("effect");
    expect(importersOf("effect")).toEqual([]);
    expect(versionsOf("effect", tree).length).toBeGreaterThan(0);
    expect(Object.keys(tree.dependencies ?? {})).toEqual(["prisma"]);
  }, COMMAND_TIMEOUT_MS);

  // covers: AC-406-4
  it("xlsx non è nell'albero delle dipendenze e nessun sorgente lo importa", () => {
    const ls = run("npm ls xlsx --json");
    const tree = JSON.parse(ls.stdout) as LsOutput;
    expect(tree.dependencies ?? {}).not.toHaveProperty("xlsx");
    expect(ls.stdout).not.toContain("\"xlsx\"");

    expect(importersOf("xlsx")).toEqual([]);
  }, COMMAND_TIMEOUT_MS);
});
