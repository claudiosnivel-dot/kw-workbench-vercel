// Gate di T-203: verifica degli ambienti e documentazione delle variabili (AC-203-1…4).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENV_KEYS } from "@/lib/env";

const POOLER = "aws-1-eu-central-1.pooler.supabase.com";

// File env di prova con credenziali fittizie, mai valori reali.
function envFile(dir: string, name: string, user: string, password: string, host = POOLER): string {
  const path = join(dir, name);
  writeFileSync(
    path,
    [
      "# file di prova",
      `DATABASE_URL="postgresql://${user}:${password}@${host}:6543/postgres?pgbouncer=true"`,
      `DIRECT_URL="postgresql://${user}:${password}@${host}:5432/postgres?sslmode=require"`,
      "",
    ].join("\n")
  );
  return path;
}

function envCheck(args: string[]) {
  const result = spawnSync(process.execPath, ["scripts/env-check.mjs", ...args], { encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("env-check", () => {
  // covers: AC-203-1
  it("segnala una Preview che usa il DB di produzione ed esce con 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-check-"));
    const result = envCheck([
      "--production",
      envFile(dir, "production.env", "postgres.prodref", "pw-prova"),
      "--preview",
      envFile(dir, "preview.env", "postgres.prodref", "pw-prova"),
      "--development",
      join(dir, "assente.env"),
    ]);

    expect(result.stdout).toContain("PREVIEW USA IL DB DI PRODUZIONE");
    expect(result.code).toBe(1);
  });

  // covers: AC-203-2
  it("con DB distinti esce con 0 e oscura la password", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-check-"));
    const result = envCheck([
      "--production",
      envFile(dir, "production.env", "postgres.prodref", "Pw-Prova-123", "prod.pooler.example.com"),
      "--preview",
      envFile(dir, "preview.env", "postgres.stagingref", "Pw-Prova-123", "staging.pooler.example.com"),
      "--development",
      envFile(dir, "development.env", "postgres", "Pw-Prova-123", "localhost"),
    ]);

    expect(result.code).toBe(0);
    for (const host of ["prod.pooler.example.com", "staging.pooler.example.com", "localhost"]) {
      expect(result.stdout).toContain(host);
    }
    expect(result.stdout).toContain("***");
    expect(result.stdout + result.stderr).not.toContain("Pw-Prova-123");
  });

  // covers: AC-203-3
  it("senza il file di Preview esce con 1 e indica il comando vercel env pull", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-check-"));
    const result = envCheck([
      "--production",
      envFile(dir, "production.env", "postgres.prodref", "pw-prova"),
      "--preview",
      join(dir, "assente.env"),
      "--development",
      join(dir, "assente-dev.env"),
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("vercel env pull --environment=preview");
  });

  // covers: AC-203-4
  it("il documento degli ambienti copre ENV_KEYS e .gitignore esclude i file di vercel env pull", () => {
    const doc = readFileSync("docs/ENVIRONMENTS.md", "utf8");
    const gitignore = readFileSync(".gitignore", "utf8").split(/\r?\n/);

    // Ogni chiave come code span, così APP_BRAND_LOGO_URL non è coperta da APP_BRAND_LOGO_URL_DARK.
    expect(ENV_KEYS.filter((key) => !doc.includes(`\`${key}\``))).toEqual([]);
    for (const heading of ["Production", "Preview", "Development"]) {
      expect(doc).toMatch(new RegExp(`^#{2,3} ${heading}\\b`, "m"));
    }
    expect(gitignore).toContain(".env*.local");
  });
});
