-- T-1201: job di estrazione ripartibile a passi (fase, cursore, avanzamento, heartbeat, lease, tentativi,
-- annullamento), staging per job e al massimo un job attivo per sezione. RLS abilitata senza policy anche sulle
-- nuove tabelle, come le altre di public (T-205, D-20).
-- CreateEnum
CREATE TYPE "JobPhase" AS ENUM ('expand', 'autocomplete', 'metrics', 'store', 'done');

-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'canceled';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cursor" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "heartbeat_at" TIMESTAMP(3),
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "phase" "JobPhase" NOT NULL DEFAULT 'expand',
ADD COLUMN     "progress_done" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progress_total" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "job_suggestions" (
    "id" BIGSERIAL NOT NULL,
    "job_id" TEXT NOT NULL,
    "query_index" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_query" TEXT NOT NULL,

    CONSTRAINT "job_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_metrics" (
    "id" BIGSERIAL NOT NULL,
    "job_id" TEXT NOT NULL,
    "canonical_keyword" TEXT NOT NULL,
    "metrics_status" "MetricsStatus" NOT NULL,
    "metrics_provider" "MetricsProvider" NOT NULL,
    "metrics_precision" "MetricsPrecision",
    "avg_monthly_searches" INTEGER,
    "competition" DOUBLE PRECISION,
    "low_top_of_page_bid_micros" BIGINT,
    "high_top_of_page_bid_micros" BIGINT,

    CONSTRAINT "job_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_suggestions_job_id_query_index_keyword_key" ON "job_suggestions"("job_id", "query_index", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "job_metrics_job_id_canonical_keyword_key" ON "job_metrics"("job_id", "canonical_keyword");

-- AddForeignKey
ALTER TABLE "job_suggestions" ADD CONSTRAINT "job_suggestions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_metrics" ADD CONSTRAINT "job_metrics_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- I job pending o running preesistenti non sono ripartibili (nessun cursore): falliti prima di creare l'indice,
-- così i duplicati storici non lo fanno fallire (D-05).
UPDATE "jobs"
SET "status" = 'failed',
    "error_message" = 'Interrotto dalla migrazione dei job',
    "completed_at" = COALESCE("completed_at", CURRENT_TIMESTAMP),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" IN ('pending', 'running');

-- Al massimo un job attivo per sezione, imposto dal database (CWE-362). Prisma non esprime gli indici parziali.
CREATE UNIQUE INDEX "jobs_one_active_per_subproject" ON "jobs" ("subproject_id") WHERE "status" IN ('pending', 'running');

-- EnableRowLevelSecurity
ALTER TABLE "job_suggestions" ENABLE ROW LEVEL SECURITY;

-- EnableRowLevelSecurity
ALTER TABLE "job_metrics" ENABLE ROW LEVEL SECURITY;
