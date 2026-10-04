import { prisma } from "@/lib/prisma";

/** Svuota tutte le tabelle di public tranne _prisma_migrations. */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}
