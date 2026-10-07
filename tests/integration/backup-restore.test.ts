// Gate di T-604 (AC-604-1…AC-604-4): backup e ripristino verificati con conteggi e hash, guardia sulla produzione.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runRestore } from "../../scripts/db-restore.mjs";
import { resetDatabase } from "../helpers/db";

const RESTORE_DB = "kwb_restore_check";
// Password fittizia di AC-604-4, mai un valore reale.
const SOURCE_PASSWORD = "pw-segreta-77";
const testUrl = new URL(process.env.TEST_DATABASE_URL ?? "");
const workDir = mkdtempSync(join(tmpdir(), "kwb-backup-"));
let copy: Client;

function runScript(script: string, args: string[]) {
  return spawnSync(process.execPath, [join("scripts", script), ...args], { encoding: "utf8" });
}

/** Container del Postgres di test: quello che pubblica la porta di TEST_DATABASE_URL (compose in locale, service in CI). */
function testDbContainer(): string {
  const result = spawnSync("docker", ["ps", "--filter", `publish=${testUrl.port}`, "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  const name = result.stdout.trim().split("\n")[0];
  if (result.status !== 0 || !name) {
    throw new Error(`nessun container Docker pubblica la porta ${testUrl.port} del Postgres di test`);
  }
  return name;
}

async function seedSource(): Promise<void> {
  await resetDatabase();
  const users = await Promise.all(
    ["t604-a", "t604-b", "t604-c"].map((username) => prisma.user.create({ data: { display_name: username, password_hash: "hash-fittizio" } }))
  );
  const projects = await Promise.all(
    users.slice(0, 2).map((user, index) => prisma.project.create({
        data: { name: `Progetto ${index}`, workspace: { create: { name: user.display_name, slug: `ws-${user.id}` } } },
      }))
  );
  const sections = await Promise.all(
    [projects[0], projects[0], projects[1]].map((project, index) =>
      prisma.subproject.create({ data: { project_id: project.id, name: `Sezione ${index}`, position: index } })
    )
  );
  await prisma.keywordCandidate.createMany({
    data: Array.from({ length: 500 }, (_, index) => {
      const section = sections[index % 3];
      const keyword = `keyword ${index}`;
      return {
        project_id: section.project_id,
        subproject_id: section.id,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "seed",
        source_query: "keyword",
      };
    }),
  });
  await prisma.job.createMany({
    data: [sections[0], sections[2]].map((section) => ({ project_id: section.project_id, subproject_id: section.id })),
  });
  await prisma.appSetting.createMany({
    data: [
      { key: "t604.uno", value_encrypted: "valore-cifrato-1" },
      { key: "t604.due", value_encrypted: "valore-cifrato-2" },
    ],
  });
}

beforeAll(async () => {
  await seedSource();
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE)`);
  await prisma.$executeRawUnsafe(`CREATE DATABASE ${RESTORE_DB}`);

  const container = testDbContainer();
  const backup = runScript("db-backup.mjs", ["--container", container, "--db", testUrl.pathname.slice(1), "--out-dir", workDir]);
  expect(backup.status, backup.stderr).toBe(0);
  expect(backup.stdout).toMatch(/client: pg_dump \(PostgreSQL\) \d+/);
  const [dump] = readdirSync(workDir).filter((name) => name.endsWith(".dump"));
  const restore = runScript("db-restore.mjs", ["--file", join(workDir, dump), "--container", container, "--db", RESTORE_DB]);
  expect(restore.status, restore.stderr).toBe(0);

  const copyUrl = new URL(testUrl);
  copyUrl.pathname = `/${RESTORE_DB}`;
  copy = new Client({ connectionString: copyUrl.toString() });
  await copy.connect();
}, 120_000);

afterAll(async () => {
  await copy?.end();
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE)`);
  rmSync(workDir, { recursive: true, force: true });
});

describe("backup e ripristino nel container di test", () => {
  // covers: AC-604-1
  it("ogni tabella di public, compresa _prisma_migrations, ha lo stesso count(*) in origine e nella copia", async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    expect(tables.map(({ tablename }) => tablename)).toContain("_prisma_migrations");

    for (const { tablename } of tables) {
      const query = `SELECT count(*)::int AS n FROM "public"."${tablename}"`;
      const [source] = await prisma.$queryRawUnsafe<{ n: number }[]>(query);
      const { rows } = await copy.query<{ n: number }>(query);
      expect({ tablename, n: rows[0].n }).toEqual({ tablename, n: source.n });
    }
    const { rows } = await copy.query<{ n: number }>("SELECT count(*)::int AS n FROM keyword_candidates");
    expect(rows[0].n).toBe(500);
  });

  // covers: AC-604-2
  it("l'md5 di id e keyword di keyword_candidates ordinati per id coincide", async () => {
    const query = "SELECT md5(string_agg(id || keyword, '' ORDER BY id)) AS hash FROM keyword_candidates";
    const [source] = await prisma.$queryRawUnsafe<{ hash: string }[]>(query);
    const { rows } = await copy.query<{ hash: string }>(query);

    expect(source.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(rows[0].hash).toBe(source.hash);
  });
});

describe("guardia sulla produzione", () => {
  // covers: AC-604-3
  it("rifiuta con exit code 2 la destinazione con l'host di PRODUCTION_DB_HOST senza avviare pg_restore", async () => {
    const run = vi.fn();
    const errors: string[] = [];

    const code = await runRestore({
      argv: ["--url", "postgresql://postgres:pw-prova@db.prod.example:5432/postgres", "--file", "backup.dump"],
      env: { PRODUCTION_DB_HOST: "db.prod.example" },
      run,
      log: () => undefined,
      logError: (line) => errors.push(line),
    });

    expect(code).toBe(2);
    expect(errors.join("\n")).toContain("PRODUCTION_DB_HOST");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("password della URL di origine", () => {
  // covers: AC-604-4
  it("non compare né in stdout né in stderr di db-backup.mjs", () => {
    // URL composta qui, porta 1 senza server: pg_dump o psql falliscono dopo aver ricevuto la password.
    const sourceUrl = new URL("postgresql://127.0.0.1:1/kw_workbench_test");
    sourceUrl.username = "backup";
    sourceUrl.password = SOURCE_PASSWORD;

    const result = runScript("db-backup.mjs", ["--url", sourceUrl.toString(), "--out-dir", workDir]);

    expect(result.stdout).not.toContain(SOURCE_PASSWORD);
    expect(result.stderr).not.toContain(SOURCE_PASSWORD);
    expect(result.status).not.toBe(0);
  });
});
