// Gate di T-205: Data API di Supabase chiusa con RLS deny-by-default (AC-205-1…3, D-20).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";

type DriverAdapterFailure = Prisma.PrismaClientKnownRequestError & {
  meta?: { driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } };
};

const PROBE_ROLE = "rls_probe";
const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");
// Prima migrazione soggetta alla convenzione «RLS nella stessa migrazione della CREATE TABLE».
const FIRST_RLS_MIGRATION = 12;

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN
        CREATE ROLE ${PROBE_ROLE} NOLOGIN;
      END IF;
    END
    $$
  `);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${PROBE_ROLE}`);
  await prisma.$executeRawUnsafe(`GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO ${PROBE_ROLE}`);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP OWNED BY ${PROBE_ROLE}`);
  await prisma.$executeRawUnsafe(`DROP ROLE ${PROBE_ROLE}`);
});

beforeEach(async () => {
  await resetDatabase();
});

describe("RLS deny-by-default sulle tabelle di public", () => {
  // covers: AC-205-1
  it("ogni tabella di public ha RLS abilitata, nessuna è FORCE e non esistono policy", async () => {
    const [tables] = await prisma.$queryRaw<{ total: number; rls_off: number; rls_forced: number }[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE NOT c.relrowsecurity)::int AS rls_off,
             count(*) FILTER (WHERE c.relforcerowsecurity)::int AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `;
    const [policies] = await prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM pg_policies WHERE schemaname = 'public'
    `;

    // Le 13 tabelle di T-205 ci sono: la query non può passare a vuoto.
    expect(tables.total).toBeGreaterThanOrEqual(13);
    expect(tables.rls_off).toBe(0);
    expect(tables.rls_forced).toBe(0);
    expect(policies.total).toBe(0);
  });

  // covers: AC-205-2
  it("un ruolo non proprietario con i grant non legge righe e non inserisce", async () => {
    await prisma.user.create({ data: { display_name: "rls-owner", password_hash: "hash-fittizio" } });

    let visibleUsers: number | undefined;
    const probe = prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET ROLE ${PROBE_ROLE}`);
      const [row] = await tx.$queryRawUnsafe<{ total: number }[]>("SELECT count(*)::int AS total FROM users");
      visibleUsers = row.total;
      await tx.$executeRawUnsafe(
        "INSERT INTO projects (id, name, updated_at) VALUES ('rls-probe-project', 'probe', now())"
      );
      // Arrivare qui vuol dire che l'INSERT è passato: il rollback annulla anche SET ROLE.
      throw new Error("INSERT del ruolo rls_probe riuscito");
    });

    const error = await probe.catch((caught: unknown) => caught);
    expect(visibleUsers).toBe(0);
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    // Con l'adapter pg (T-403) SQLSTATE e messaggio di Postgres stanno in meta.driverAdapterError.cause.
    const cause = (error as DriverAdapterFailure).meta?.driverAdapterError?.cause;
    expect(cause?.originalCode).toBe("42501");
    expect(String(cause?.originalMessage)).toContain("new row violates row-level security policy");
    expect(await prisma.project.count()).toBe(0);
  });

  // covers: AC-205-3
  it("il client Prisma, proprietario delle tabelle, crea, rilegge, aggiorna e cancella", async () => {
    const user = await prisma.user.create({ data: { display_name: "rls-prisma", password_hash: "hash-fittizio" } });
    const project = await prisma.project.create({
      data: { name: "rls-project", workspace: { create: { name: "rls", slug: `ws-${user.id}` } } },
    });

    const users = await prisma.user.findMany({ select: { id: true } });
    const projects = await prisma.project.findMany({ select: { id: true } });
    expect(users).toEqual([{ id: user.id }]);
    expect(projects).toEqual([{ id: project.id }]);

    const updated = await prisma.project.updateMany({ where: { id: project.id }, data: { name: "rls-renamed" } });
    expect(updated.count).toBe(1);
    const deleted = await prisma.project.deleteMany({ where: { id: project.id } });
    expect(deleted.count).toBe(1);
  });

  // Convenzione di T-205: ogni nuova tabella in public abilita RLS nella stessa migrazione.
  it("dalla migrazione 0012 ogni CREATE TABLE ha ENABLE ROW LEVEL SECURITY nello stesso file", () => {
    const missing: string[] = [];
    for (const dir of readdirSync(MIGRATIONS_DIR, { withFileTypes: true })) {
      const number = Number.parseInt(dir.name, 10);
      if (!dir.isDirectory() || !(number >= FIRST_RLS_MIGRATION)) {
        continue;
      }
      const sql = readFileSync(path.join(MIGRATIONS_DIR, dir.name, "migration.sql"), "utf8");
      for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:"public"\.)?"([^"]+)"/gi)) {
        const table = match[1];
        const enable = new RegExp(`ALTER TABLE (?:ONLY )?(?:"public"\\.)?"${table}"\\s+ENABLE ROW LEVEL SECURITY`, "i");
        if (!enable.test(sql)) {
          missing.push(`${dir.name}: ${table}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
