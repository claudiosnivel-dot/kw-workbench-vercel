-- T-903: registro delle richieste al fornitore di metriche con licenza (tetti di spesa, limitatore tra istanze).
-- Migrazione additiva. RLS abilitata senza policy come le altre tabelle di public (T-205, D-20).
-- CreateEnum
CREATE TYPE "MetricsRequestStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateTable
CREATE TABLE "metrics_provider_requests" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" "MetricsProvider" NOT NULL,
    "project_id" TEXT,
    "job_id" TEXT,
    "keyword_count" INTEGER NOT NULL,
    "cost_usd" DECIMAL(10,4),
    "estimated_cost_usd" DECIMAL(10,4) NOT NULL,
    "status" "MetricsRequestStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "metrics_provider_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metrics_provider_requests_created_at_idx" ON "metrics_provider_requests"("created_at");

-- AddForeignKey
ALTER TABLE "metrics_provider_requests" ADD CONSTRAINT "metrics_provider_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EnableRowLevelSecurity
ALTER TABLE "metrics_provider_requests" ENABLE ROW LEVEL SECURITY;
