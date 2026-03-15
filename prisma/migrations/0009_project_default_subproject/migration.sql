-- AlterTable
ALTER TABLE "projects" ADD COLUMN "default_subproject_id" TEXT;

-- Backfill default section using first subproject by position/created_at
UPDATE "projects" AS p
SET "default_subproject_id" = s."id"
FROM LATERAL (
  SELECT "id"
  FROM "subprojects"
  WHERE "project_id" = p."id"
  ORDER BY "position" ASC, "created_at" ASC
  LIMIT 1
) AS s
WHERE p."default_subproject_id" IS NULL;

-- CreateIndex
CREATE INDEX "projects_default_subproject_id_idx" ON "projects"("default_subproject_id");

-- AddForeignKey
ALTER TABLE "projects"
ADD CONSTRAINT "projects_default_subproject_id_fkey"
FOREIGN KEY ("default_subproject_id") REFERENCES "subprojects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
