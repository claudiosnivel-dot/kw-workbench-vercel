-- Macrotask 74 mcp-serp, T-7401 (D-64). Migrazione additiva: nessuna riga esistente cambia.
-- keyword_serps.results: i risultati organici salvati, nell'ordine di urls, con titolo e descrizione di DataForSEO
-- ([{ url, title, description }], testo di terzi ripulito e tagliato a 300 caratteri). Le righe di prima restano null e
-- si completano quando si rinnovano dopo i 30 giorni.
-- AlterTable
ALTER TABLE "keyword_serps" ADD COLUMN     "results" JSONB;
