-- Macrotask 39 ai-usage-counter, T-3901 e T-3903 (D-46, D-48). Migrazione additiva.
-- ai_requests: una riga per ogni tentativo verso OpenRouter (funzione, modello, esito, status HTTP, durata, workspace,
-- root admin), con i soli metadati: nessuna colonna per testi, keyword o messaggi del fornitore (CWE-532). Conservata
-- 30 giorni dal cron del catalogo; RLS abilitata senza policy come le altre tabelle di public (T-205, D-20).
-- metrics_provider_requests.provider_code: il codice di DataForSEO dell'esito, null per le righe di prima, i timeout e
-- gli errori di rete.
-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('titles', 'article');

-- CreateEnum
CREATE TYPE "AiRequestOutcome" AS ENUM ('ok', 'provider_busy', 'account_daily_limit', 'account_rate_limit', 'unavailable', 'timeout', 'invalid_response', 'auth');

-- AlterTable
ALTER TABLE "metrics_provider_requests" ADD COLUMN     "provider_code" INTEGER;

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "outcome" "AiRequestOutcome" NOT NULL,
    "http_status" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "workspace_id" TEXT,
    "by_root_admin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_requests_created_at_idx" ON "ai_requests"("created_at");

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data API di Supabase chiusa anche sulla nuova tabella (T-205, D-20).
ALTER TABLE "ai_requests" ENABLE ROW LEVEL SECURITY;
