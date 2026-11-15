-- T-6702: angoli da valutare (D-62), le keyword principali delle pagine che il motore per risultati di Google scioglie.
-- Migrazione additiva con default: nessuna riga esistente cambia, la RLS di strategy_keywords resta com'è.
-- AlterTable
ALTER TABLE "strategy_keywords" ADD COLUMN "angle" BOOLEAN NOT NULL DEFAULT false;
