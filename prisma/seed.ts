import type { PrismaClient } from "../lib/generated/prisma/client";

export const DEFAULT_BRANDS = [
  { brand: "google", reason: "Global brand default" },
  { brand: "amazon", reason: "Global brand default" },
  { brand: "youtube", reason: "Global brand default" },
  { brand: "facebook", reason: "Global brand default" },
  { brand: "instagram", reason: "Global brand default" },
];

/**
 * Composizioni globali per lingua (T-3702, D-44): la ricerca usa solo quelle della sua lingua. Il set italiano è stato
 * scelto il 2026-10-18 contando i suggerimenti di Google su quattro parole di prova (le 8 con più suggerimenti su 16).
 */
export const DEFAULT_PATTERNS = {
  en: [
    "{seed} for beginners",
    "best {seed}",
    "{seed} near me",
    "how to {seed}",
    "{seed} vs {seed} alternative",
    "free {seed} tool",
    "{seed} template",
    "{seed} examples",
  ],
  it: [
    "{seed} per",
    "{seed} vicino a me",
    "{seed} recensioni",
    "{seed} prezzo",
    "{seed} online",
    "migliori {seed}",
    "{seed} offerte",
    "{seed} opinioni",
  ],
} as const;

/**
 * Inserisce i default globali (project_id null) mancanti in un'unica transazione, senza cancellare
 * nulla (T-204); una composizione manca se manca la coppia (lingua, pattern) (T-3702). Niente createMany
 * con skipDuplicates né upsert sul vincolo unico: con project_id NULL Postgres considera distinti i
 * valori e il vincolo non impedisce i duplicati (schema: T-1103).
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

    const patternRows = await tx.expansionPattern.findMany({
      where: { project_id: null },
      select: { language_code: true, pattern: true },
    });
    // Chiave (lingua, pattern) come l'indice unico delle righe globali (migrazione 0046).
    const keyOf = (languageCode: string, pattern: string) => JSON.stringify([languageCode, pattern]);
    const existingPatterns = new Set(patternRows.map((row) => keyOf(row.language_code, row.pattern)));
    const missingPatterns = Object.entries(DEFAULT_PATTERNS).flatMap(([languageCode, patterns]) =>
      patterns
        .filter((pattern) => !existingPatterns.has(keyOf(languageCode, pattern)))
        .map((pattern) => ({ project_id: null, language_code: languageCode, pattern, enabled: true }))
    );

    if (missingPatterns.length > 0) {
      await tx.expansionPattern.createMany({ data: missingPatterns });
    }
  });
}

/**
 * Email del root admin (T-1401): il root admin senza email (utente legacy, D-05) riceve APP_ADMIN_EMAIL già
 * verificata, così continua ad accedere con la sua password usando l'email. Idempotente: con l'email già assegnata
 * non cambia nulla.
 */
export async function assignRootAdminEmail(client: Pick<PrismaClient, "user">, email: string): Promise<void> {
  await client.user.updateMany({
    where: { is_root_admin: true, email: null },
    data: { email, email_verified_at: new Date() },
  });
}

async function main() {
  // Stesso client e stesso adapter pg dell'app (in v7 PrismaClient richiede un driver adapter).
  const { prisma } = await import("../lib/prisma");
  const { getAdminEmail } = await import("../lib/env");

  try {
    await seedGlobalDefaults(prisma);
    const adminEmail = getAdminEmail();
    if (adminEmail) {
      await assignRootAdminEmail(prisma, adminEmail);
    }
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
