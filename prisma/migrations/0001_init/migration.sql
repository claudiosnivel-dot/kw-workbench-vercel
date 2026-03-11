-- CreateEnum
CREATE TYPE "AutocompleteProvider" AS ENUM ('MOCK', 'GOOGLE_DIRECT');

-- CreateEnum
CREATE TYPE "MetricsProvider" AS ENUM ('NONE', 'MOCK', 'GOOGLE_KEYWORD_PLANNER');

-- CreateEnum
CREATE TYPE "BrandStatus" AS ENUM ('allowed', 'excluded', 'review');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "SearchIntent" AS ENUM ('informational', 'commercial', 'transactional', 'navigational', 'mixed');

-- CreateEnum
CREATE TYPE "KeywordType" AS ENUM ('generic', 'question', 'comparison', 'branded', 'local', 'tool', 'service', 'product', 'content_topic');

-- CreateEnum
CREATE TYPE "MetricsStatus" AS ENUM ('missing', 'mock', 'fetched', 'imported', 'failed');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('extraction');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language_code" TEXT NOT NULL DEFAULT 'en',
    "country_code" TEXT NOT NULL DEFAULT 'US',
    "autocomplete_provider" "AutocompleteProvider" NOT NULL DEFAULT 'MOCK',
    "metrics_provider" "MetricsProvider" NOT NULL DEFAULT 'NONE',
    "min_volume" INTEGER NOT NULL DEFAULT 0,
    "exclude_brands" BOOLEAN NOT NULL DEFAULT true,
    "expand_alpha" BOOLEAN NOT NULL DEFAULT true,
    "expand_numeric" BOOLEAN NOT NULL DEFAULT true,
    "expand_patterns" BOOLEAN NOT NULL DEFAULT true,
    "auto_classification" BOOLEAN NOT NULL DEFAULT true,
    "scoring_profile" TEXT NOT NULL DEFAULT 'balanced',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seeds" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_candidates" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalized_keyword" TEXT NOT NULL,
    "canonical_keyword" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_query" TEXT NOT NULL,
    "brand_status" "BrandStatus" NOT NULL DEFAULT 'allowed',
    "brand_reason" TEXT,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "selected_for_export" BOOLEAN NOT NULL DEFAULT false,
    "keyword_type" "KeywordType" NOT NULL DEFAULT 'generic',
    "search_intent" "SearchIntent" NOT NULL DEFAULT 'mixed',
    "is_question" BOOLEAN NOT NULL DEFAULT false,
    "is_local_intent" BOOLEAN NOT NULL DEFAULT false,
    "is_tool_intent" BOOLEAN NOT NULL DEFAULT false,
    "is_commercial_intent" BOOLEAN NOT NULL DEFAULT false,
    "metrics_status" "MetricsStatus" NOT NULL DEFAULT 'missing',
    "metrics_provider" "MetricsProvider" NOT NULL DEFAULT 'NONE',
    "avg_monthly_searches" INTEGER,
    "competition" DOUBLE PRECISION,
    "low_top_of_page_bid_micros" BIGINT,
    "high_top_of_page_bid_micros" BIGINT,
    "score" DOUBLE PRECISION,
    "metrics_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" "JobType" NOT NULL DEFAULT 'extraction',
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "result" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_blacklist" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "brand" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expansion_patterns" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "pattern" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expansion_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seeds_project_id_idx" ON "seeds"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_candidates_project_id_canonical_keyword_key" ON "keyword_candidates"("project_id", "canonical_keyword");

-- CreateIndex
CREATE INDEX "keyword_candidates_project_id_review_status_idx" ON "keyword_candidates"("project_id", "review_status");

-- CreateIndex
CREATE INDEX "keyword_candidates_project_id_brand_status_idx" ON "keyword_candidates"("project_id", "brand_status");

-- CreateIndex
CREATE INDEX "keyword_candidates_project_id_search_intent_idx" ON "keyword_candidates"("project_id", "search_intent");

-- CreateIndex
CREATE INDEX "keyword_candidates_project_id_keyword_type_idx" ON "keyword_candidates"("project_id", "keyword_type");

-- CreateIndex
CREATE INDEX "jobs_project_id_status_idx" ON "jobs"("project_id", "status");

-- CreateIndex
CREATE INDEX "jobs_status_created_at_idx" ON "jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "brand_blacklist_project_id_brand_key" ON "brand_blacklist"("project_id", "brand");

-- CreateIndex
CREATE INDEX "brand_blacklist_brand_idx" ON "brand_blacklist"("brand");

-- CreateIndex
CREATE UNIQUE INDEX "expansion_patterns_project_id_pattern_key" ON "expansion_patterns"("project_id", "pattern");

-- AddForeignKey
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_candidates" ADD CONSTRAINT "keyword_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_blacklist" ADD CONSTRAINT "brand_blacklist_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expansion_patterns" ADD CONSTRAINT "expansion_patterns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
