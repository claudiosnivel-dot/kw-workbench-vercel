// Gate di T-1101 (AC-1101-1…4): rimozioni approvate dall'utente il 2026-10-06 (R1…R9 e R11…R21; R10 e R22 erano
// già assenti, tolti da T-901), baseline knip aggiornata, nessun residuo nel sorgente, typecheck e lint verdi.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeKnipReport, type KnipBaseline, type KnipReport } from "./knip-baseline";

const ROOT = process.cwd();

function run(command: string): SpawnSyncReturns<string> {
  return spawnSync(command, {
    shell: true,
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
    timeout: 300_000,
  });
}

// Simboli che knip segnalava come morti e che T-1101 ha rimosso o reso privati (R12, R14, R15, R16, R17, R18).
const REMOVED_SYMBOLS = [
  { file: "lib/auth/current-user.ts", symbol: "isRootAdminUser" },
  { file: "lib/auth/current-user.ts", symbol: "requireAdminUserFromCookies" },
  { file: "lib/auth/current-user.ts", symbol: "requireRootAdminUserFromCookies" },
  { file: "lib/auth/session.ts", symbol: "SESSION_COOKIE_NAME" },
  { file: "lib/integrations/app-settings.ts", symbol: "getSettingValue" },
  { file: "lib/modules/jobs/job-runner.ts", symbol: "runQueuedExtractionJobs" },
  { file: "lib/modules/jobs/job-runner.ts", symbol: "getJobStats" },
  { file: "lib/text/encoding.ts", symbol: "repairCommonMojibake" },
];
// File rimossi (R6, R8).
const REMOVED_FILES = ["app/api/auth/session/route.ts", "app/settings/page.tsx", "app/settings/integrations/page.tsx"];

const GREP_SCOPE = ["app", "components", "lib", "proxy.ts", ".env.example"];

describe("codice morto rimosso (T-1101)", () => {
  let report: KnipReport;
  const baseline = JSON.parse(readFileSync(join(ROOT, "tests/tooling/knip-baseline.json"), "utf8")) as KnipBaseline;

  beforeAll(() => {
    // knip esce con 1 quando trova segnalazioni: si legge il JSON, non l'exit code.
    const result = run("npx knip --reporter json");
    expect(result.error).toBeUndefined();
    report = JSON.parse(result.stdout) as KnipReport;
  }, 300_000);

  // covers: AC-1101-1
  it("knip non segnala i simboli e i file rimossi e ha tante voci quante la baseline aggiornata", () => {
    const triples = normalizeKnipReport(report);
    const reported = triples.map((triple) => `${triple.file}#${triple.symbol}`);

    for (const removed of REMOVED_SYMBOLS) expect(reported).not.toContain(`${removed.file}#${removed.symbol}`);
    for (const file of REMOVED_FILES) expect(triples.map((triple) => triple.file)).not.toContain(file);
    for (const removed of REMOVED_SYMBOLS) {
      expect(baseline.entries.some((entry) => entry.file === removed.file && entry.symbol === removed.symbol)).toBe(false);
    }
    expect(triples).toHaveLength(baseline.entries.length);
  });

  // covers: AC-1101-2
  it("le rotte di progetti e auth/config non hanno più GET; POST, PATCH e DELETE restano", async () => {
    // L'import crea il client Prisma senza collegarsi: basta un URL locale qualsiasi.
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:54329/kw_workbench_test");
    try {
      const projects = await import("@/app/api/projects/route");
      const project = await import("@/app/api/projects/[id]/route");
      const authConfig = await import("@/app/api/auth/config/route");

      expect((projects as Record<string, unknown>).GET).toBeUndefined();
      expect((project as Record<string, unknown>).GET).toBeUndefined();
      expect((authConfig as Record<string, unknown>).GET).toBeUndefined();
      expect(typeof projects.POST).toBe("function");
      expect(typeof project.PATCH).toBe("function");
      expect(typeof project.DELETE).toBe("function");
      expect(typeof authConfig.PATCH).toBe("function");
    } finally {
      vi.unstubAllEnvs();
    }
  }, 120_000);

  // covers: AC-1101-3
  it.each([
    ["runQueuedExtractionJobs", ["-F", "runQueuedExtractionJobs"]],
    ["getJobStats", ["-F", "getJobStats"]],
    ["GOOGLE_ADS_METRICS_FILE", ["-F", "GOOGLE_ADS_METRICS_FILE"]],
    ["DEFAULT_METRICS_PROVIDER", ["-F", "DEFAULT_METRICS_PROVIDER"]],
    // La rotta rimossa, non /api/auth/session-ended di T-502, che resta.
    ["api/auth/session", ["-E", "api/auth/session([^-]|$)"]],
    ["LEGACY_KEYS", ["-F", "LEGACY_KEYS"]],
    ["getSettingValue", ["-w", "-F", "getSettingValue"]],
  ])("git grep di %s non trova righe", (_name, pattern) => {
    const result = spawnSync("git", ["grep", "-n", ...pattern, "--", ...GREP_SCOPE], { cwd: ROOT, encoding: "utf8" });

    expect(result.stdout).toBe("");
    expect(result.status).toBe(1);
  });

  // covers: AC-1101-4
  it("tsc --noEmit e il lint terminano con exit code 0", () => {
    const typecheck = run("npx tsc --noEmit");
    expect(typecheck.stdout + typecheck.stderr).toBe("");
    expect(typecheck.status).toBe(0);

    const lint = run("npx eslint . --max-warnings=0");
    expect(lint.status, lint.stdout).toBe(0);
  }, 300_000);
});
