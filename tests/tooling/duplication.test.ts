// Gate di T-1102 (AC-1102-1…3): helper, tipi e componenti consolidati in una sola definizione e jscpd
// senza duplicati sui file consolidati.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CONFIG = "tests/tooling/jscpd-consolidated.json";
const SCOPE = ["app", "components", "lib"];

type JscpdReport = {
  duplicates: { firstFile: { name: string }; secondFile: { name: string } }[];
  statistics: { formats: Record<string, { sources: Record<string, unknown> }> };
};

function gitGrep(pattern: string, scope: string[] = SCOPE) {
  const result = spawnSync("git", ["grep", "-n", "--fixed-strings", pattern, "--", ...scope], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const lines = result.stdout.split("\n").filter(Boolean);
  return { status: result.status, lines, files: [...new Set(lines.map((line) => line.split(":")[0]))] };
}

describe("duplicazioni consolidate", () => {
  const config = JSON.parse(readFileSync(join(ROOT, CONFIG), "utf8")) as { minTokens: number; path: string[] };
  const files = config.path;
  let output: string;
  let report: JscpdReport;

  beforeAll(() => {
    output = mkdtempSync(join(tmpdir(), "jscpd-t1102-"));
    const result = spawnSync(
      process.execPath,
      [
        join(ROOT, "node_modules/jscpd/bin/jscpd"),
        ...["--min-tokens", String(config.minTokens), "--reporters", "json", "--silent", "--output", output],
        ...files,
      ],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000 }
    );
    expect(result.error).toBeUndefined();
    report = JSON.parse(readFileSync(join(output, "jscpd-report.json"), "utf8")) as JscpdReport;
  }, 120_000);

  afterAll(() => {
    rmSync(output, { recursive: true, force: true });
  });

  // covers: AC-1102-1
  it("jscpd con min-tokens 50 analizza tutti i file della configurazione e non trova duplicati", () => {
    expect(config.minTokens).toBe(50);
    for (const file of files) expect(existsSync(join(ROOT, file)), file).toBe(true);

    const analysed = new Set(
      Object.values(report.statistics.formats).flatMap((format) => Object.keys(format.sources).map((name) => name.replaceAll("\\", "/")))
    );
    expect([...analysed].sort()).toEqual([...files].sort());
    expect(report.duplicates.map((clone) => `${clone.firstFile.name} <> ${clone.secondFile.name}`)).toEqual([]);
  });

  // covers: AC-1102-2
  it("jobStatusTone, formatDate ed ExportScope hanno una sola definizione; getValue e checked non esistono", () => {
    expect(gitGrep("function jobStatusTone").files).toEqual(["lib/view/format.ts"]);
    expect(gitGrep("function formatDate").files).toEqual(["lib/view/format.ts"]);
    expect(gitGrep("type ExportScope").files).toEqual(["lib/modules/export-types.ts"]);

    for (const pattern of ["function getValue", "function checked"]) {
      const result = gitGrep(pattern);
      expect(result.lines, pattern).toEqual([]);
      expect(result.status, pattern).toBe(1);
    }
  });

  // covers: AC-1102-3
  it("createSessionToken( non compare in app e la sola chiamata è in lib/auth/session-cookie.ts", () => {
    const inApp = gitGrep("createSessionToken(", ["app"]);
    expect(inApp.lines).toEqual([]);
    expect(inApp.status).toBe(1);

    const calls = gitGrep("createSessionToken(").lines.filter((line) => !line.includes("function createSessionToken("));
    expect(calls.map((line) => line.split(":")[0])).toEqual(["lib/auth/session-cookie.ts"]);
  });
});
