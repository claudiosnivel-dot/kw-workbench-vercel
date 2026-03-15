-- AlterTable
ALTER TABLE "projects" ADD COLUMN "default_subproject_id" TEXT;

-- Backfill default section using first subproject by position/created_at
UPDATE "projects" AS p
SET "default_subproject_id" = (
  SELECT s."id"
  FROM "subprojects" AS s
  WHERE s."project_id" = p."id"
  ORDER BY s."position" ASC, s."created_at" ASC
  LIMIT 1
)
WHERE p."default_subproject_id" IS NULL;

-- CreateIndex
CREATE INDEX "projects_default_subproject_id_idx" ON "projects"("default_subproject_id");

-- AddForeignKey
ALTER TABLE "projects"
ADD CONSTRAINT "projects_default_subproject_id_fkey"
FOREIGN KEY ("default_subproject_id") REFERENCES "subprojects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
