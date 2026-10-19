// Gate di T-204: seed dei default globali idempotente e transazionale (AC-204-1…4); T-403: AC-403-4.
// Gate di T-3702 (AC-3702-2, D-44): composizioni globali per lingua, 8 inglesi e 8 italiane.
// Gate di T-5001 (AC-5001-2, D-47): 8 composizioni anche per lo spagnolo, 24 righe globali.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedGlobalDefaults } from "@/prisma/seed";
import { resetDatabase } from "../helpers/db";

const require = createRequire(import.meta.url);
const PRISMA_CLI = require.resolve("prisma/build/index.js");

async function globalCounts() {
  return {
    brands: await prisma.brandBlacklist.count({ where: { project_id: null } }),
    patterns: await prisma.expansionPattern.count({ where: { project_id: null } }),
  };
}

async function globalPatternsByLanguage() {
  const rows = await prisma.expansionPattern.groupBy({
    by: ["language_code"],
    where: { project_id: null },
    _count: { _all: true },
    orderBy: { language_code: "asc" },
  });
  return Object.fromEntries(rows.map((row) => [row.language_code, row._count._all]));
}

async function globalIds(): Promise<string[]> {
  const brands = await prisma.brandBlacklist.findMany({ where: { project_id: null }, select: { id: true } });
  const patterns = await prisma.expansionPattern.findMany({ where: { project_id: null }, select: { id: true } });
  return [...brands, ...patterns].map((row) => row.id).sort();
}

/** Client reale in cui il secondo inserimento dentro la transazione fallisce. */
function clientFailingOnSecondInsert(): PrismaClient {
  let inserts = 0;
  const wrapDelegate = (delegate: object) =>
    new Proxy(delegate, {
      get(target, method) {
        const value = Reflect.get(target, method);
        if (typeof value !== "function") {
          return value;
        }
        if (method !== "create" && method !== "createMany") {
          return value.bind(target);
        }
        return (args: unknown) => {
          inserts += 1;
          if (inserts === 2) {
            throw new Error("inserimento di prova fallito");
          }
          return value.call(target, args);
        };
      },
    });

  return {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      prisma.$transaction((tx) =>
        fn(
          new Proxy(tx, {
            get(target, property) {
              const value = Reflect.get(target, property);
              return property === "brandBlacklist" || property === "expansionPattern" ? wrapDelegate(value) : value;
            },
          })
        )
      ),
  } as unknown as PrismaClient;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("seed dei default globali", () => {
  // covers: AC-204-1
  // impacted-by: T-3702 (composizioni per lingua: 8 inglesi e 8 italiane, 16 pattern globali)
  // impacted-by: T-5001 (8 composizioni spagnole: 24 pattern globali)
  it("due esecuzioni di seguito lasciano 5 brand e 24 pattern globali", async () => {
    await seedGlobalDefaults(prisma);
    expect(await globalCounts()).toEqual({ brands: 5, patterns: 24 });

    await seedGlobalDefaults(prisma);
    expect(await globalCounts()).toEqual({ brands: 5, patterns: 24 });
  });

  // covers: AC-3702-2
  // covers: AC-5001-2
  // impacted-by: T-5001 (AC-3702-2 emendato: 24 righe globali, 8 per lingua)
  it("su expansion_patterns vuota due esecuzioni lasciano 24 composizioni globali, 8 en, 8 it e 8 es", async () => {
    expect(await prisma.expansionPattern.count()).toBe(0);

    for (let run = 0; run < 2; run += 1) {
      await seedGlobalDefaults(prisma);
      expect(await prisma.expansionPattern.count({ where: { project_id: null } })).toBe(24);
      expect(await globalPatternsByLanguage()).toEqual({ en: 8, es: 8, it: 8 });
    }
  });

  // covers: AC-204-2
  it("rieseguito sui default presenti non cancella né ricrea righe", async () => {
    await seedGlobalDefaults(prisma);
    const before = await globalIds();

    await seedGlobalDefaults(prisma);

    expect(await globalIds()).toEqual(before);
  });

  // covers: AC-204-3
  it("non tocca le righe globali aggiunte a mano né quelle di progetto", async () => {
    const project = await prisma.project.create({
      data: { name: "progetto seed", workspace: { create: { name: "seed", slug: "ws-seed" } } },
    });
    const manual = await prisma.brandBlacklist.create({ data: { project_id: null, brand: "ebay" } });
    const scoped = await prisma.brandBlacklist.create({ data: { project_id: project.id, brand: "acme" } });

    await seedGlobalDefaults(prisma);

    expect(await prisma.brandBlacklist.findUnique({ where: { id: manual.id } })).toMatchObject({ brand: "ebay" });
    expect(await prisma.brandBlacklist.findUnique({ where: { id: scoped.id } })).toMatchObject({ brand: "acme" });
    expect(await prisma.brandBlacklist.count()).toBe(7);
  });

  // covers: AC-204-4
  it("un errore a metà fa rollback e lascia i conteggi invariati", async () => {
    const before = {
      brands: await prisma.brandBlacklist.count(),
      patterns: await prisma.expansionPattern.count(),
    };

    await expect(seedGlobalDefaults(clientFailingOnSecondInsert())).rejects.toThrow("inserimento di prova fallito");

    expect({
      brands: await prisma.brandBlacklist.count(),
      patterns: await prisma.expansionPattern.count(),
    }).toEqual(before);
  });

  // covers: AC-403-4
  // impacted-by: T-3702 (16 pattern globali, 8 per lingua)
  // impacted-by: T-5001 (24 pattern globali, 8 per lingua)
  it("prisma db seed lanciato due volte dalla CLI lascia 5 brand e 24 pattern globali", async () => {
    // DATABASE_URL e DIRECT_URL sono già quelle del DB di test (setup d'integrazione).
    for (let run = 0; run < 2; run += 1) {
      const seed = spawnSync(process.execPath, [PRISMA_CLI, "db", "seed"], {
        env: process.env,
        encoding: "utf8",
        timeout: 180_000,
      });
      expect(seed.status, seed.stdout + seed.stderr).toBe(0);
    }

    expect(await globalCounts()).toEqual({ brands: 5, patterns: 24 });
  }, 400_000);
});
