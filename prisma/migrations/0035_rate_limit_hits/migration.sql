-- T-1701: rate limiter a finestra scorrevole su Postgres (D-12, nessun Redis). Una riga per tentativo ammesso per
-- chiave; consumo e pulizia per chiave e istante usano l'indice (key, created_at). RLS abilitata senza policy (T-205).
-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_hits_key_created_at_idx" ON "rate_limit_hits"("key", "created_at");

-- Data API di Supabase chiusa anche sulla nuova tabella (T-205, D-20).
ALTER TABLE "rate_limit_hits" ENABLE ROW LEVEL SECURITY;
