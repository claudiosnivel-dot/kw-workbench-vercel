// Gate di T-202: il build Vercel applica migrazioni e seed solo al DB giusto (AC-202-1…4).
import { describe, expect, it } from "vitest";
import { decideMigration, runVercelBuild } from "../../scripts/vercel-build.mjs";

const PROD_HOST = "aws-1-eu-central-1.pooler.supabase.com";

// URL di prova: credenziali fittizie, mai valori reali.
function directUrl(user: string, password = "pw-prova", host = PROD_HOST): string {
  return `postgresql://${user}:${password}@${host}:5432/postgres?sslmode=require`;
}

async function build(env: Record<string, string | undefined>, failing?: string) {
  const calls: string[] = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runVercelBuild({
    env,
    run: async (argv: string[]) => {
      const command = argv.join(" ");
      calls.push(command);
      return command === failing ? 1 : 0;
    },
    log: (line: string) => stdout.push(line),
    logError: (line: string) => stderr.push(line),
  });
  return { code, calls, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

describe("guardia sulle migrazioni del build Vercel", () => {
  // covers: AC-202-1
  it("in production migra, fa il seed e poi il build", async () => {
    const result = await build({ VERCEL_ENV: "production", DIRECT_URL: directUrl("postgres.prodref") });

    expect(result.calls).toEqual(["prisma migrate deploy", "prisma db seed", "next build"]);
    expect(result.code).toBe(0);
  });

  // covers: AC-202-2
  it("in preview salta le migrazioni sul DB di produzione e senza PRODUCTION_DB_HOST", async () => {
    const sameHost = await build({
      VERCEL_ENV: "preview",
      DIRECT_URL: directUrl("postgres"),
      PRODUCTION_DB_HOST: PROD_HOST,
    });
    const unset = await build({ VERCEL_ENV: "preview", DIRECT_URL: directUrl("postgres") });

    for (const result of [sameHost, unset]) {
      expect(result.calls).toEqual(["next build"]);
      expect(result.stdout).toContain("[vercel-build]");
      expect(result.stdout).toContain("migrazioni saltate");
    }
    expect(unset.stdout).toContain("PRODUCTION_DB_HOST");
  });

  // covers: AC-202-3
  it("con PRODUCTION_DB_HOST nella forma utente@host confronta utente e host", () => {
    const productionDbHost = `postgres.prodref@${PROD_HOST}`;

    expect(
      decideMigration({
        VERCEL_ENV: "preview",
        PRODUCTION_DB_HOST: productionDbHost,
        DIRECT_URL: directUrl("postgres.stagingref"),
      }).migrate
    ).toBe(true);
    expect(
      decideMigration({
        VERCEL_ENV: "preview",
        PRODUCTION_DB_HOST: productionDbHost,
        DIRECT_URL: directUrl("postgres.prodref"),
      }).migrate
    ).toBe(false);
  });

  // covers: AC-202-4
  it("una migrazione fallita ferma il build con lo stesso exit code senza stampare la password", async () => {
    const result = await build(
      { VERCEL_ENV: "production", DIRECT_URL: directUrl("postgres.prodref", "S3gretaDiProva") },
      "prisma migrate deploy"
    );

    expect(result.code).toBe(1);
    expect(result.calls).not.toContain("next build");
    expect(result.stdout).not.toContain("S3gretaDiProva");
    expect(result.stderr).not.toContain("S3gretaDiProva");
  });
});
