-- Macrotask 46 wordpress, T-4601 (D-46). Migrazione additiva.
-- Collegamento del progetto a un sito WordPress con le password per le applicazioni: indirizzo https del sito, utente e
-- password cifrata con encryptSecret (CWE-312). Bozza dell'articolo su WordPress (T-4602): id e link restituiti
-- dall'API REST. I progetti e gli articoli esistenti partono senza collegamento; la RLS di projects e articles resta
-- com'è.
ALTER TABLE "projects" ADD COLUMN "wp_site_url" VARCHAR(300),
ADD COLUMN "wp_username" VARCHAR(120),
ADD COLUMN "wp_app_password_encrypted" TEXT;

ALTER TABLE "articles" ADD COLUMN "wp_post_id" INTEGER,
ADD COLUMN "wp_post_url" VARCHAR(500);
