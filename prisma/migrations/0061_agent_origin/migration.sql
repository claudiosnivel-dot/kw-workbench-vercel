-- Macrotask 73 mcp-research, T-7301 e T-7302 (D-64, D-65). Migrazione additiva: nessuna riga esistente cambia.
-- jobs.origin: chi ha avviato la ricerca, l'app (APP, anche per i lavori di prima) o Claude Code dal server MCP (AGENT).
-- metrics_provider_requests.agent: richiesta a pagamento di un lavoro avviato da Claude Code; con il suo costo stimato
-- conta per il tetto giornaliero di spesa di Claude Code.
-- CreateEnum
CREATE TYPE "JobOrigin" AS ENUM ('APP', 'AGENT');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "origin" "JobOrigin" NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "metrics_provider_requests" ADD COLUMN     "agent" BOOLEAN NOT NULL DEFAULT false;
