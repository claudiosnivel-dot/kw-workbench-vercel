import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth/session";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

function countMigrationFolders(): number {
  return readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true }).filter((entry) =>
    entry.isDirectory()
  ).length;
}

async function countFinishedMigrations(): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL
  `;
  return Number(rows[0].count);
}

describe("smoke DB di test", () => {
  // covers: AC-101-1
  it("risponde a SELECT 1 e ha applicato tutte le migrazioni", async () => {
    const rows = await prisma.$queryRaw<{ value: number }[]>`SELECT 1 AS value`;

    expect(rows[0].value).toBe(1);
    expect(await countFinishedMigrations()).toBe(countMigrationFolders());
  });

  // covers: AC-101-4
  it("resetDatabase svuota i dati e createUserWithSession firma un cookie valido", async () => {
    const owner = await prisma.user.create({
      data: { display_name: "smoke-owner", password_hash: "not-a-real-hash" },
    });
    await prisma.project.create({ data: { name: "Smoke project", owner_user_id: owner.id } });
    const migrationsBefore = await countFinishedMigrations();

    await resetDatabase();

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.project.count()).toBe(0);
    expect(await countFinishedMigrations()).toBe(migrationsBefore);

    const { cookie } = await createUserWithSession({ displayName: "smoke-user" });
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: "smoke-user@example.test" } });
    const token = cookie.replace(/^kwb_session=/, "");
    const session = await verifySessionToken(token);

    expect(cookie.startsWith("kwb_session=")).toBe(true);
    // impacted-by: T-501 (il token porta uid al posto di userId)
    expect(session?.uid).toBe(stored.id);
  });
});
