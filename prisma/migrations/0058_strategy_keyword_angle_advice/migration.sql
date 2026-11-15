-- T-6901: consiglio dell'AI sugli angoli da valutare (D-62): azione, keyword principale della pagina target, motivo,
-- alternativa e H1. Migrazione additiva con colonna nullable: nessuna riga esistente cambia, la RLS di
-- strategy_keywords resta com'è.
-- AlterTable
ALTER TABLE "strategy_keywords" ADD COLUMN "angle_advice" JSONB;
