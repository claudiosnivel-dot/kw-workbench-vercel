-- T-901: precisione del volume di ricerca (D-17). Migrazione additiva: colonna nullable, nessun backfill
-- (le righe esistenti non dichiarano la precisione finché un provider o un import non le aggiorna).
-- CreateEnum
CREATE TYPE "MetricsPrecision" AS ENUM ('exact', 'range');

-- AlterTable
ALTER TABLE "keyword_candidates" ADD COLUMN "metrics_precision" "MetricsPrecision";
