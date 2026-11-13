-- Macrotask 61 plan-data, T-6101 (D-57). Migrazione additiva.
-- keyword_serps: i primi 10 risultati organici di Google di una keyword (solo gli URL, nell'ordine dei risultati) per
-- lingua, paese e forma canonica, con l'istante in cui sono arrivati da DataForSEO; il piano li riusa per 30 giorni.
-- Nessun testo dei risultati oltre agli URL. RLS abilitata senza policy, come le altre tabelle di public (T-205, D-20).
-- CreateTable
CREATE TABLE "keyword_serps" (
    "id" TEXT NOT NULL,
    "language_code" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "canonical_keyword" TEXT NOT NULL,
    "urls" TEXT[],
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_serps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "keyword_serps_language_code_country_code_canonical_keyword_key" ON "keyword_serps"("language_code", "country_code", "canonical_keyword");

ALTER TABLE "keyword_serps" ENABLE ROW LEVEL SECURITY;
