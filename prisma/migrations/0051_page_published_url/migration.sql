-- Macrotask 45 article-export, T-4501 (D-46). Migrazione additiva.
-- Indirizzo della pagina pubblicata («Segna come pubblicata», T-4502): https assoluto fino a 500 caratteri, usato dai
-- link interni degli articoli esportati. Le pagine esistenti partono senza indirizzo; la RLS di strategy_pages (abilitata
-- dalla 0039) resta com'è.
ALTER TABLE "strategy_pages" ADD COLUMN "published_url" VARCHAR(500);
