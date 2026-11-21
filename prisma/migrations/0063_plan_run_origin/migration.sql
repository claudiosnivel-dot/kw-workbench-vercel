-- Macrotask 75 mcp-plan, T-7501 (D-64). Migrazione additiva: nessuna riga esistente cambia.
-- plan_runs.origin: chi ha avviato il lavoro di piano, l'app (APP, anche per i lavori di prima) o Claude Code dal server
-- MCP (AGENT). Con AGENT il lavoro non chiede nulla alle AI di Titan SEO e le sue richieste a DataForSEO contano per il
-- tetto giornaliero di spesa di Claude Code. Stesso tipo JobOrigin delle ricerche (migrazione 0061).
-- AlterTable
ALTER TABLE "plan_runs" ADD COLUMN     "origin" "JobOrigin" NOT NULL DEFAULT 'APP';
