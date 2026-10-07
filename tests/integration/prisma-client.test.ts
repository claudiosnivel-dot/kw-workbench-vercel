// Gate di T-403: Prisma 7 con prisma.config.ts e adapter pg (AC-403-1…3).
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPoolConfig, prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";
import { assertLocalTestDatabase } from "../helpers/db-guard";

const require = createRequire(import.meta.url);
const PRISMA_CLI = require.resolve("prisma/build/index.js");
const ROOT = process.cwd();
const CLI_TIMEOUT_MS = 180_000;
// DB vuoto creato e rimosso dal test sullo stesso Postgres locale di TEST_DATABASE_URL.
const PROBE_DB = "kw_workbench_migrate_probe";

const testUrl = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** CLI di Prisma lanciata con node (niente npx/.cmd su Windows), con l'ambiente indicato. */
function prismaCli(args: string[], env: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: CLI_TIMEOUT_MS,
  });
}

async function adminQuery(sql: string): Promise<void> {
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .map((file) => join(dir, file))
    .filter((file) => /\.(ts|tsx|mjs|js)$/.test(file) && statSync(join(ROOT, file)).isFile())
    .filter((file) => !file.replace(/\\/g, "/").startsWith("lib/generated/"));
}

describe("Prisma 7: prisma.config.ts e adapter pg", () => {
  const probeUrl = withDatabase(testUrl, PROBE_DB);

  beforeAll(async () => {
    await adminQuery(`DROP DATABASE IF EXISTS ${PROBE_DB} WITH (FORCE)`);
    await adminQuery(`CREATE DATABASE ${PROBE_DB}`);
  });

  afterAll(async () => {
    await adminQuery(`DROP DATABASE IF EXISTS ${PROBE_DB} WITH (FORCE)`);
  });

  // covers: AC-403-1
  it("migrate deploy tramite prisma.config.ts applica ogni migrazione su un DB vuoto e migrate status esce 0", async () => {
    const env = { ...process.env, DATABASE_URL: probeUrl, DIRECT_URL: probeUrl };

    const deploy = prismaCli(["migrate", "deploy"], env);
    expect(deploy.status, deploy.stdout + deploy.stderr).toBe(0);
    expect(deploy.stdout + deploy.stderr).toContain("prisma.config.ts");

    const status = prismaCli(["migrate", "status"], env);
    expect(status.status, status.stdout + status.stderr).toBe(0);

    const folders = readdirSync(join(ROOT, "prisma/migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const client = new Client({ connectionString: probeUrl });
    await client.connect();
    try {
      const { rows } = await client.query<{ migration_name: string }>(
        "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name"
      );
      expect(rows.map((row) => row.migration_name)).toEqual(folders);
    } finally {
      await client.end();
    }
  }, 2 * CLI_TIMEOUT_MS);

  // covers: AC-403-2
  it("buildPoolConfig usa PRISMA_CONNECTION_LIMIT e PRISMA_POOL_TIMEOUT e il client legge ciò che crea", async () => {
    const config = buildPoolConfig({ ...process.env, PRISMA_CONNECTION_LIMIT: "2", PRISMA_POOL_TIMEOUT: "7" });

    expect(config.max).toBe(2);
    expect(config.connectionTimeoutMillis).toBe(7000);
    expect(config.idleTimeoutMillis).toBeGreaterThan(0);
    expect(config.connectionString).toBe(process.env.DATABASE_URL);
    expect(config.connectionString).not.toMatch(/connection_limit|pgbouncer|pool_timeout/);

    // Anche con un URL del pooler nel formato documentato (README) i parametri del vecchio engine spariscono.
    const pooled = buildPoolConfig({
      DATABASE_URL: "postgresql://u:p@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&pool_timeout=20",
      PRISMA_CONNECTION_LIMIT: "2",
      PRISMA_POOL_TIMEOUT: "7",
    });
    expect(pooled.connectionString).not.toMatch(/connection_limit|pgbouncer|pool_timeout/);

    await resetDatabase();
    const created = await prisma.user.create({
      data: { display_name: "prisma-adapter-probe", password_hash: "hash-non-usato" },
    });
    expect(await prisma.user.findUnique({ where: { id: created.id } })).toMatchObject({
      id: created.id,
      display_name: "prisma-adapter-probe",
    });
  });

  // covers: AC-403-3
  it("prisma generate esce 0 senza DIRECT_URL e DATABASE_URL e nei sorgenti non resta @prisma/client", () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DIRECT_URL;

    const generate = prismaCli(["generate"], env);
    expect(generate.status, generate.stdout + generate.stderr).toBe(0);

    const offenders = ["app", "lib", "components", "prisma"]
      .flatMap(sourceFiles)
      .filter((file) => readFileSync(join(ROOT, file), "utf8").includes("@prisma/client"));
    expect(offenders).toEqual([]);

    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, Record<string, string>>;
    const versions = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of ["prisma", "@prisma/client", "@prisma/adapter-pg"]) {
      expect(versions[name], name).toMatch(/^7\.10\.\d+$/);
    }
  }, CLI_TIMEOUT_MS);

  // Senza DIRECT_URL i comandi che usano il DB falliscono nominando la variabile.
  it("migrate deploy senza DIRECT_URL fallisce con un messaggio che nomina DIRECT_URL", () => {
    // Vuota e non assente: dotenv non sovrascrive una variabile già impostata, quindi un DIRECT_URL
    // nel .env locale non può far migrare un DB reale; env() di prisma/config tratta il vuoto come mancante.
    const env = { ...process.env, DIRECT_URL: "" };

    const deploy = prismaCli(["migrate", "deploy"], env);
    expect(deploy.status).not.toBe(0);
    expect(deploy.stdout + deploy.stderr).toContain("DIRECT_URL");
  }, CLI_TIMEOUT_MS);
});
