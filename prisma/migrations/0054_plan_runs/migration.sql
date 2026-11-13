-- Macrotask 62 plan-runs, T-6201 (D-57). Migrazione additiva.
-- plan_runs: il lavoro di piano in background (volumi, risultati di Google, raggruppamento e salvataggio) con fase,
-- cursore, avanzamento, battito e lease come article_runs; request è la richiesta della POST /strategies, notice il
-- motivo per cui un dato del piano è mancato. strategies: fonte del raggruppamento (ENGINE finché il modulo 63 non usa i
-- risultati di Google) e motivo del raggruppamento di riserva. RLS abilitata senza policy (T-205, D-20).
-- CreateEnum
CREATE TYPE "StrategyGroupingSource" AS ENUM ('SERP', 'ENGINE');

-- AlterTable
ALTER TABLE "strategies" ADD COLUMN     "grouping_notice" TEXT,
ADD COLUMN     "grouping_source" "StrategyGroupingSource" NOT NULL DEFAULT 'ENGINE';

-- CreateTable
CREATE TABLE "plan_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "requested_by" TEXT,
    "request" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "phase" TEXT NOT NULL DEFAULT 'volumes',
    "cursor" JSONB NOT NULL DEFAULT '{}',
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "progress_done" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "strategy_id" TEXT,
    "notice" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_runs_project_id_status_idx" ON "plan_runs"("project_id", "status");

-- CreateIndex
CREATE INDEX "plan_runs_status_locked_until_idx" ON "plan_runs"("status", "locked_until");

-- CreateIndex
CREATE INDEX "plan_runs_workspace_id_idx" ON "plan_runs"("workspace_id");

-- CreateIndex
CREATE INDEX "plan_runs_requested_by_idx" ON "plan_runs"("requested_by");

-- CreateIndex
CREATE INDEX "plan_runs_strategy_id_idx" ON "plan_runs"("strategy_id");

-- AddForeignKey
ALTER TABLE "plan_runs" ADD CONSTRAINT "plan_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_runs" ADD CONSTRAINT "plan_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_runs" ADD CONSTRAINT "plan_runs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_runs" ADD CONSTRAINT "plan_runs_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Al massimo un lavoro pending o running per progetto: un secondo avvio contemporaneo fallisce sull'indice e la rotta
-- risponde 409 JOB_ALREADY_ACTIVE (CWE-362, CWE-770). Prisma non esprime gli indici parziali.
CREATE UNIQUE INDEX "plan_runs_one_active_per_project" ON "plan_runs"("project_id") WHERE "status" IN ('pending', 'running');

-- Data API di Supabase chiusa anche sulla nuova tabella (T-205, D-20).
ALTER TABLE "plan_runs" ENABLE ROW LEVEL SECURITY;
