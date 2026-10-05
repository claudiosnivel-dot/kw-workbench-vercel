-- T-707: sorgente del punteggio delle keyword (D-18). Migrazione additiva: nessuna riga cancellata.
-- Backfill deterministico: metrics per le righe con metriche (fetched, imported, mock), heuristic per le
-- altre. Lo script arriva al server in un'unica richiesta, eseguita come una sola transazione: nessuna
-- riga resta con la sorgente non valorizzata.
-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('metrics', 'heuristic');

-- AlterTable
ALTER TABLE "keyword_candidates" ADD COLUMN "score_source" "ScoreSource" NOT NULL DEFAULT 'heuristic';

-- Backfill
UPDATE "keyword_candidates" SET "score_source" = 'metrics' WHERE "metrics_status" IN ('fetched', 'imported', 'mock');
