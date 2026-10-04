// Gate di T-204: seed dei default globali idempotente e transazionale (AC-204-1…4).
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedGlobalDefaults } from "@/prisma/seed";
import { resetDatabase } from "../helpers/db";

async function globalCounts() {
  return {
    brands: await prisma.brandBlacklist.count({ where: { project_id: null } }),
    patterns: await prisma.expansionPattern.count({ where: { project_id: null } }),
  };
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
  it("due esecuzioni di seguito lasciano 5 brand e 8 pattern globali", async () => {
    await seedGlobalDefaults(prisma);
    expect(await globalCounts()).toEqual({ brands: 5, patterns: 8 });

    await seedGlobalDefaults(prisma);
    expect(await globalCounts()).toEqual({ brands: 5, patterns: 8 });
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
    const project = await prisma.project.create({ data: { name: "progetto seed" } });
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
});
