-- T-1703: contatori d'uso per workspace e periodo UTC (avvii del giorno, keyword del mese, keyword arricchite dal
-- fornitore con licenza, rimborsi automatici) e causa del fallimento dei job con il rimborso della quota (D-27
-- emendata). Colonne nuove nullable o con default: additiva. RLS abilitata senza policy (T-205).
-- CreateEnum
CREATE TYPE "JobFailureCause" AS ENUM ('INTERNAL', 'USER');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('runs_day', 'keywords_month', 'licensed_keywords_month', 'run_refunds_month');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "failure_cause" "JobFailureCause",
ADD COLUMN "quota_refunded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" BIGSERIAL NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_workspace_id_metric_period_start_key" ON "usage_counters"("workspace_id", "metric", "period_start");

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data API di Supabase chiusa anche sulla nuova tabella (T-205, D-20).
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
