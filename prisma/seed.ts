import type { PrismaClient } from "../lib/generated/prisma/client";

export const DEFAULT_BRANDS = [
  { brand: "google", reason: "Global brand default" },
  { brand: "amazon", reason: "Global brand default" },
  { brand: "youtube", reason: "Global brand default" },
  { brand: "facebook", reason: "Global brand default" },
  { brand: "instagram", reason: "Global brand default" },
];

export const DEFAULT_PATTERNS = [
  "{seed} for beginners",
  "best {seed}",
  "{seed} near me",
  "how to {seed}",
  "{seed} vs {seed} alternative",
  "free {seed} tool",
  "{seed} template",
  "{seed} examples",
];

/**
 * Inserisce i default globali (project_id null) mancanti in un'unica transazione, senza cancellare
 * nulla (T-204). Niente createMany con skipDuplicates né upsert sul vincolo unico: con project_id
 * NULL Postgres considera distinti i valori e il vincolo non impedisce i duplicati (schema: T-1103).
 */
export async function seedGlobalDefaults(client: Pick<PrismaClient, "$transaction">): Promise<void> {
  await client.$transaction(async (tx) => {
    const brandRows = await tx.brandBlacklist.findMany({ where: { project_id: null }, select: { brand: true } });
    const existingBrands = new Set(brandRows.map((row) => row.brand));
    const missingBrands = DEFAULT_BRANDS.filter((item) => !existingBrands.has(item.brand));

    if (missingBrands.length > 0) {
      await tx.brandBlacklist.createMany({
        data: missingBrands.map((item) => ({ project_id: null, brand: item.brand, reason: item.reason })),
      });
    }

    const patternRows = await tx.expansionPattern.findMany({ where: { project_id: null }, select: { pattern: true } });
    const existingPatterns = new Set(patternRows.map((row) => row.pattern));
    const missingPatterns = DEFAULT_PATTERNS.filter((pattern) => !existingPatterns.has(pattern));

    if (missingPatterns.length > 0) {
      await tx.expansionPattern.createMany({
        data: missingPatterns.map((pattern) => ({ project_id: null, pattern, enabled: true })),
      });
    }
  });
}

async function main() {
  // Stesso client e stesso adapter pg dell'app (in v7 PrismaClient richiede un driver adapter).
  const { prisma } = await import("../lib/prisma");

  try {
    await seedGlobalDefaults(prisma);
    await prisma.$disconnect();
  } catch (error) {
    console.error("Seed error:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Solo da CLI (prisma db seed lancia tsx prisma/seed.ts), mai all'import.
if (/(^|[\\/])seed\.ts$/.test(process.argv[1] ?? "")) {
  void main();
}
