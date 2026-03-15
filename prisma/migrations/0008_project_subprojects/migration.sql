-- CreateTable
CREATE TABLE "subprojects" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "language_code_override" TEXT,
    "country_code_override" TEXT,
    "autocomplete_provider_override" "AutocompleteProvider",
    "metrics_provider_override" "MetricsProvider",
    "min_volume_override" INTEGER,
    "exclude_brands_override" BOOLEAN,
    "expand_alpha_override" BOOLEAN,
    "expand_numeric_override" BOOLEAN,
    "expand_patterns_override" BOOLEAN,
    "auto_classification_override" BOOLEAN,
    "scoring_profile_override" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subprojects_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "seeds" ADD COLUMN "subproject_id" TEXT;
ALTER TABLE "keyword_candidates" ADD COLUMN "subproject_id" TEXT;
ALTER TABLE "jobs" ADD COLUMN "subproject_id" TEXT;

-- BackfillSubprojects
INSERT INTO "subprojects" (
    "id",
    "project_id",
    "name",
    "description",
    "position",
    "language_code_override",
    "country_code_override",
    "autocomplete_provider_override",
    "metrics_provider_override",
    "min_volume_override",
    "exclude_brands_override",
    "expand_alpha_override",
    "expand_numeric_override",
    "expand_patterns_override",
    "auto_classification_override",
    "scoring_profile_override",
    "created_at",
    "updated_at"
)
SELECT
    'sp_' || md5(p."id" || '-' || clock_timestamp()::text || '-' || random()::text),
    p."id",
    'Generale',
    NULL,
    0,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "projects" p;

-- BackfillSubprojectReferences
UPDATE "seeds" s
SET "subproject_id" = sp."id"
FROM "subprojects" sp
WHERE sp."project_id" = s."project_id"
  AND sp."name" = 'Generale'
  AND s."subproject_id" IS NULL;

UPDATE "keyword_candidates" kc
SET "subproject_id" = sp."id"
FROM "subprojects" sp
WHERE sp."project_id" = kc."project_id"
  AND sp."name" = 'Generale'
  AND kc."subproject_id" IS NULL;

UPDATE "jobs" j
SET "subproject_id" = sp."id"
FROM "subprojects" sp
WHERE sp."project_id" = j."project_id"
  AND sp."name" = 'Generale'
  AND j."subproject_id" IS NULL;

-- AlterColumnsNotNull
ALTER TABLE "seeds" ALTER COLUMN "subproject_id" SET NOT NULL;
ALTER TABLE "keyword_candidates" ALTER COLUMN "subproject_id" SET NOT NULL;
ALTER TABLE "jobs" ALTER COLUMN "subproject_id" SET NOT NULL;

-- DropIndex
DROP INDEX "keyword_candidates_project_id_canonical_keyword_key";

-- CreateIndex
CREATE UNIQUE INDEX "subprojects_project_id_name_key" ON "subprojects"("project_id", "name");
CREATE INDEX "subprojects_project_id_position_idx" ON "subprojects"("project_id", "position");
CREATE INDEX "seeds_subproject_id_idx" ON "seeds"("subproject_id");
CREATE UNIQUE INDEX "keyword_candidates_subproject_id_canonical_keyword_key" ON "keyword_candidates"("subproject_id", "canonical_keyword");
CREATE INDEX "keyword_candidates_subproject_id_review_status_idx" ON "keyword_candidates"("subproject_id", "review_status");
CREATE INDEX "keyword_candidates_subproject_id_brand_status_idx" ON "keyword_candidates"("subproject_id", "brand_status");
CREATE INDEX "keyword_candidates_subproject_id_search_intent_idx" ON "keyword_candidates"("subproject_id", "search_intent");
CREATE INDEX "keyword_candidates_subproject_id_keyword_type_idx" ON "keyword_candidates"("subproject_id", "keyword_type");
CREATE INDEX "jobs_subproject_id_status_idx" ON "jobs"("subproject_id", "status");

-- AddForeignKey
ALTER TABLE "subprojects" ADD CONSTRAINT "subprojects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_subproject_id_fkey" FOREIGN KEY ("subproject_id") REFERENCES "subprojects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "keyword_candidates" ADD CONSTRAINT "keyword_candidates_subproject_id_fkey" FOREIGN KEY ("subproject_id") REFERENCES "subprojects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_subproject_id_fkey" FOREIGN KEY ("subproject_id") REFERENCES "subprojects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
