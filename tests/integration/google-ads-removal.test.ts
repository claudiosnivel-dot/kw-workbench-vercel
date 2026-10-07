// Gate di T-901 (AC-901-1, AC-901-2): integrazione Google Ads rimossa (rotte, card di /admin) e migrazione che
// porta i dati a NONE, ricrea l'enum MetricsProvider e cancella credenziali e impostazioni Google Ads.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";

const auth = vi.hoisted(() => ({ user: null as unknown }));

vi.mock("@/lib/auth/page-guard", () => ({ requirePageUser: async () => auth.user }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin",
}));

const MIGRATIONS_DIR = "prisma/migrations";
const REMOVAL_MIGRATION = "0021_remove_google_ads";
const SCRATCH_DB = "kwb_t901_migration_check";
const testUrl = new URL(process.env.TEST_DATABASE_URL ?? "");

/**
 * Instradamento delle rotte API come nel router di Next.js: segmenti statici, poi dinamici `[x]`, poi
 * catch-all `[...x]`; senza un route.ts che esporti il metodo, Next risponde 404 (o 405 se il metodo manca).
 * La risposta reale di Next per la rotta rimossa è provata anche dallo smoke E2E.
 */
async function dispatch(method: "GET" | "PATCH", pathname: string): Promise<number> {
  let dir = "app";
  for (const segment of pathname.split("/").filter(Boolean)) {
    const entries = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()) : [];
    const next =
      entries.find((entry) => entry.name === segment) ??
      entries.find((entry) => /^\[[^.]+\]$/.test(entry.name)) ??
      entries.find((entry) => /^\[\[?\.\.\./.test(entry.name));
    if (!next) {
      return 404;
    }
    dir = path.join(dir, next.name);
    if (/^\[\[?\.\.\./.test(next.name)) {
      break;
    }
  }
  const routeFile = path.join(dir, "route.ts");
  if (!existsSync(routeFile)) {
    return 404;
  }
  const handlers = (await import(/* @vite-ignore */ path.resolve(routeFile))) as Record<string, unknown>;
  return typeof handlers[method] === "function" ? 200 : 405;
}

function migrationsUpTo(name: string, inclusive: boolean): string[] {
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((entry) => existsSync(path.join(MIGRATIONS_DIR, entry, "migration.sql")))
    .sort();
  const index = names.indexOf(name);
  expect(index).toBeGreaterThan(-1);
  return names.slice(0, inclusive ? index + 1 : index);
}

async function applyMigrations(client: Client, names: string[]): Promise<void> {
  for (const name of names) {
    await client.query(readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"));
  }
}

let scratch: Client;

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
  await prisma.$executeRawUnsafe(`CREATE DATABASE ${SCRATCH_DB}`);
  const scratchUrl = new URL(testUrl);
  scratchUrl.pathname = `/${SCRATCH_DB}`;
  scratch = new Client({ connectionString: scratchUrl.toString() });
  await scratch.connect();
});

// Il DB di test è condiviso tra i file: il root admin del test non deve trovarne un altro lasciato da un file
// precedente (users_single_root_admin_idx), che rendeva il test dipendente dall'ordine dei file.
beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await scratch?.end();
  await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
});

describe("rimozione dell'integrazione Google Ads", () => {
  // covers: AC-901-1
  it("le rotte Google Ads rispondono 404 e /admin non mostra più Google Keyword Planner", async () => {
    expect(await dispatch("GET", "/api/integrations/google-ads")).toBe(404);
    expect(await dispatch("GET", "/api/integrations/google-ads/connect")).toBe(404);
    expect(await dispatch("PATCH", "/api/integrations/google-ads/config")).toBe(404);
    // Controllo del modello di instradamento: la rotta di Google Sheets esiste ancora.
    expect(await dispatch("GET", "/api/integrations/google-sheets/connect")).toBe(200);

    const root = await prisma.user.create({
      data: { display_name: "t901-root", password_hash: "hash-fittizio", role: "ADMIN", is_root_admin: true },
    });
    auth.user = { id: root.id, displayName: root.display_name, role: "ADMIN", isRootAdmin: true };
    const { default: AdminPage } = await import("@/app/admin/page");

    const html = renderToStaticMarkup(await AdminPage());

    expect(html).toContain("Dashboard Admin");
    expect(html).not.toContain("Google Keyword Planner");
    await prisma.user.delete({ where: { id: root.id } });
  });

  // covers: AC-901-2
  it("la migrazione porta i dati a NONE, ricrea l'enum e cancella credenziali e impostazioni Google Ads", async () => {
    // Prisma crea il proprio registro prima di applicare le migrazioni; la 0012 vi abilita RLS.
    await scratch.query(`CREATE TABLE "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY)`);
    await applyMigrations(scratch, migrationsUpTo(REMOVAL_MIGRATION, false));
    await scratch.query(`
      INSERT INTO "projects" ("id", "name", "metrics_provider", "updated_at")
        VALUES ('p1', 'Planner', 'GOOGLE_KEYWORD_PLANNER', now());
      INSERT INTO "subprojects" ("id", "project_id", "name", "metrics_provider_override", "updated_at")
        VALUES ('s1', 'p1', 'Generale', 'GOOGLE_KEYWORD_PLANNER', now());
      INSERT INTO "keyword_candidates"
        ("id", "project_id", "subproject_id", "keyword", "normalized_keyword", "canonical_keyword", "source",
         "source_query", "metrics_provider", "updated_at")
        SELECT 'k' || n, 'p1', 's1', 'moka ' || n, 'moka ' || n, 'moka ' || n, 'seed', 'moka',
               'GOOGLE_KEYWORD_PLANNER', now()
        FROM generate_series(1, 3) AS n;
      INSERT INTO "google_ads_credentials" ("id", "refresh_token_encrypted", "updated_at")
        VALUES ('g1', 'cifrato-di-prova', now());
      INSERT INTO "app_settings" ("id", "key", "value_encrypted", "updated_at") VALUES
        ('a1', 'GOOGLE_ADS_CLIENT_ID', 'cifrato-di-prova', now()),
        ('a2', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'cifrato-di-prova', now()),
        ('a3', 'APP_BRAND_NAME', 'cifrato-di-prova', now());
    `);

    await applyMigrations(scratch, [REMOVAL_MIGRATION]);

    const providers = await scratch.query(`
      SELECT (SELECT "metrics_provider"::text FROM "projects" WHERE "id" = 'p1') AS project,
             (SELECT "metrics_provider_override"::text FROM "subprojects" WHERE "id" = 's1') AS section,
             (SELECT array_agg(DISTINCT "metrics_provider"::text) FROM "keyword_candidates") AS candidates
    `);
    expect(providers.rows[0]).toEqual({ project: "NONE", section: "NONE", candidates: ["NONE"] });
    const labels = await scratch.query(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'MetricsProvider'`
    );
    expect(labels.rows.map((row) => row.enumlabel)).not.toContain("GOOGLE_KEYWORD_PLANNER");
    expect(labels.rows.map((row) => row.enumlabel)).toEqual(expect.arrayContaining(["NONE", "MOCK", "DATAFORSEO", "PLANNER_CSV"]));
    const tables = await scratch.query(
      `SELECT count(*)::int AS total FROM information_schema.tables WHERE table_name = 'google_ads_credentials'`
    );
    expect(tables.rows[0].total).toBe(0);
    const settings = await scratch.query(`SELECT "key" FROM "app_settings" ORDER BY "key"`);
    expect(settings.rows.filter((row) => row.key.startsWith("GOOGLE_ADS_"))).toHaveLength(0);
    expect(settings.rows.map((row) => row.key)).toEqual(["APP_BRAND_NAME"]);
  });
});
