-- T-3001 (D-41): richieste di cambio dell'email dell'account. Il token va al nuovo indirizzo e nel DB resta solo il suo
-- SHA-256 esadecimale (64 caratteri), valido 24 h e monouso; new_email è già normalizzata (minuscola, come
-- users.email). Additiva: nessuna riga esistente cambia. RLS abilitata senza policy (T-205, D-20).
-- CreateTable
CREATE TABLE "email_change_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "new_email" TEXT NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "email_change_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_change_tokens_new_email_lowercase" CHECK ("new_email" = lower("new_email"))
);

-- CreateIndex
CREATE UNIQUE INDEX "email_change_tokens_token_hash_key" ON "email_change_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_change_tokens_user_id_idx" ON "email_change_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "email_change_tokens" ADD CONSTRAINT "email_change_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data API di Supabase chiusa anche sulla nuova tabella (T-205, D-20).
ALTER TABLE "email_change_tokens" ENABLE ROW LEVEL SECURITY;
