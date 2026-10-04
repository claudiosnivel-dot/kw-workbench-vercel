import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { diffKnipAgainstBaseline, type KnipBaseline, type KnipReport } from "./knip-baseline";

const ROOT = process.cwd();

function run(command: string): SpawnSyncReturns<string> {
  return spawnSync(command, {
    shell: true,
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
    timeout: 240_000,
  });
}

const baseline = JSON.parse(readFileSync(join(ROOT, "tests/tooling/knip-baseline.json"), "utf8")) as KnipBaseline;

describe("oracoli Trueline: knip e file ignorati", () => {
  let report: KnipReport;

  beforeAll(() => {
    // knip esce con 1 quando trova segnalazioni: si legge il JSON, non l'exit code.
    const result = run("npx knip --reporter json");
    expect(result.error).toBeUndefined();
    report = JSON.parse(result.stdout) as KnipReport;
  }, 240_000);

  // covers: AC-108-1
  it("le entry di Next, il middleware e il seed non risultano file inutilizzati", () => {
    const unusedFiles = report.issues.flatMap((issue) =>
      ((issue.files as { name: string }[] | undefined) ?? []).map((file) => file.name)
    );

    expect(unusedFiles.filter((file) => /^app\/.*\/?(page|layout|route)\.tsx?$/.test(file))).toEqual([]);
    expect(unusedFiles).not.toContain("middleware.ts");
    expect(unusedFiles).not.toContain("prisma/seed.ts");
  });

  // covers: AC-108-2
  it("il report reale non ha morto nuovo; un export inutilizzato in più è l'unica differenza", () => {
    expect(diffKnipAgainstBaseline(report, baseline)).toEqual([]);

    const synthetic: KnipReport = {
      issues: [...report.issues, { file: "lib/utils.ts", exports: [{ name: "nuovoExportInutilizzato", line: 1 }] }],
    };
    expect(diffKnipAgainstBaseline(synthetic, baseline)).toEqual([
      { type: "exports", file: "lib/utils.ts", symbol: "nuovoExportInutilizzato" },
    ]);
  });

  // covers: AC-108-3
  it("la baseline di sicurezza e tsconfig.tsbuildinfo sono ignorati da git", () => {
    expect(run("git check-ignore .trueline/baseline.json").status).toBe(0);
    expect(run("git check-ignore tsconfig.tsbuildinfo").status).toBe(0);
  });

  // covers: AC-108-4
  it("la baseline d'igiene non è ignorata ed è versionata", () => {
    const listed = run("git ls-files .trueline/hygiene-baseline.json").stdout.split("\n").filter(Boolean);

    expect(run("git check-ignore .trueline/hygiene-baseline.json").status).toBe(1);
    expect(listed).toEqual([".trueline/hygiene-baseline.json"]);
  });
});
