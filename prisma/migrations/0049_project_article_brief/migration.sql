-- Macrotask 40 article-data, T-4001 (D-46). Migrazione additiva.
-- Scheda «Per gli articoli» del progetto: chi siete e cosa offrite, a chi vi rivolgete, tono (default professionale),
-- nome e indirizzo dell'attività facoltativi e indirizzo del sito per i link interni (https, senza barra finale). I
-- progetti esistenti partono con la scheda vuota e il tono professionale; la RLS di projects resta com'è.
-- CreateEnum
CREATE TYPE "ArticleTone" AS ENUM ('professional', 'friendly', 'technical');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "article_about" VARCHAR(1000),
ADD COLUMN     "article_audience" VARCHAR(300),
ADD COLUMN     "article_tone" "ArticleTone" NOT NULL DEFAULT 'professional',
ADD COLUMN     "business_address" VARCHAR(300),
ADD COLUMN     "business_name" VARCHAR(120),
ADD COLUMN     "site_url" VARCHAR(300);
