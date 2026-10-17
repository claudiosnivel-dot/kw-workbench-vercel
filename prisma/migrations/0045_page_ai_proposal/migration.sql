-- Macrotask 36 ai-titles-panel, T-3601 (D-43): ultima proposta riuscita dei titoli con l'AI di ogni pagina del piano
-- ({ h1, h2, model, createdAt }), conservata finché l'utente non la usa o la scarta. Additiva: le pagine esistenti
-- partono senza proposta; la RLS di strategy_pages (abilitata dalla 0039) resta com'è.
ALTER TABLE "strategy_pages" ADD COLUMN "ai_proposal" JSONB;
