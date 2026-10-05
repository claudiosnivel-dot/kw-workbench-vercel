-- T-810: ultima attività reale del progetto, per ordinamento e colonna «Aggiornato» della dashboard.
-- Migrazione additiva: nessuna riga cancellata. Backfill al valore più recente tra updated_at del progetto,
-- created_at e completed_at dei suoi job e updated_at delle sue sezioni (GREATEST ignora i NULL).
-- AlterTable
ALTER TABLE "projects" ADD COLUMN "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill
UPDATE "projects" AS "p" SET "last_activity_at" = GREATEST(
  "p"."updated_at",
  (SELECT MAX("j"."created_at") FROM "jobs" AS "j" WHERE "j"."project_id" = "p"."id"),
  (SELECT MAX("j"."completed_at") FROM "jobs" AS "j" WHERE "j"."project_id" = "p"."id"),
  (SELECT MAX("s"."updated_at") FROM "subprojects" AS "s" WHERE "s"."project_id" = "p"."id")
);
