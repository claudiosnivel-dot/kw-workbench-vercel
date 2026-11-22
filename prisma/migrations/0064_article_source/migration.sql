-- Macrotask 76 mcp-articles, T-7601 (D-64). Migrazione additiva: nessuna riga esistente cambia.
-- articles.source: chi ha scritto l'articolo, le AI di Titan SEO (TITAN_AI, anche per gli articoli di prima) o Claude
-- Code che lo importa dal server MCP con import_article (AGENT). L'editor e il pannello della pagina mostrano «Scritto
-- da Claude Code» per gli articoli AGENT.
-- CreateEnum
CREATE TYPE "ArticleSource" AS ENUM ('TITAN_AI', 'AGENT');

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "source" "ArticleSource" NOT NULL DEFAULT 'TITAN_AI';
