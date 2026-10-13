// Gate di T-2306 (AC-2306-1, AC-2306-3): l'onboarding a 7 passi è rimosso con tabelle, tipi e codice; resta la colonna
// projects.created_via_onboarding, usata dall'avvio rapido (T-2301).
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

// Nomi composti a pezzi: scritti per intero, questo file troverebbe se stesso nella ricerca di AC-2306-3.
const ONBOARDING = "Onboarding";
const REMOVED_TABLES = [`user_${ONBOARDING.toLowerCase()}_progress`, `${ONBOARDING.toLowerCase()}_idempotency_keys`];
const REMOVED_TYPES = ["Status", "Step", "EntryMode", "IdempotencyKind"].map((suffix) => `${ONBOARDING}${suffix}`);
const REMOVED_NAMES = [`${ONBOARDING.toLowerCase()}_progress`, `${ONBOARDING}Step`, `Resume${ONBOARDING}Button`];

describe("onboarding rimosso", () => {
  // covers: AC-2306-1
  it("dopo la migrazione 0041 tabelle e tipi dell'onboarding non esistono e projects.created_via_onboarding sì", async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY(${REMOVED_TABLES})`;
    const types = await prisma.$queryRaw<{ typname: string }[]>`
      SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = ANY(${REMOVED_TYPES})`;
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'created_via_onboarding'`;

    expect(tables).toEqual([]);
    expect(types).toEqual([]);
    expect(columns).toEqual([{ column_name: "created_via_onboarding" }]);
  });

  // covers: AC-2306-3
  it("git grep non trova i nomi dell'onboarding nei file tracciati fuori da migrazioni, documentazione e baseline", () => {
    const result = spawnSync(
      "git",
      ["grep", "-n", ...REMOVED_NAMES.flatMap((name) => ["-e", name]), "--", ".", ":!prisma/migrations", ":!docs", ":!.trueline"],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    expect(result.stdout.split("\n").filter(Boolean)).toEqual([]);
    // 1 = nessuna riga trovata; 0 vorrebbe dire righe trovate, altro un errore di git.
    expect(result.status).toBe(1);
  });
});
