-- T-1404: token di recupero password, salvati solo come hash SHA-256 esadecimale (64 caratteri), validi 1 h e
-- monouso. La tabella ha la stessa forma di email_verification_tokens (T-1403): LIKE ... INCLUDING ALL copia colonne,
-- default, chiave primaria e indici con i nomi di questa tabella, non la chiave esterna, che si aggiunge qui. L'indice
-- unico copiato prende il suffisso _idx: si rinomina come lo chiama Prisma (_key). RLS abilitata senza policy (T-205,
-- D-20).
-- CreateTable
CREATE TABLE "password_reset_tokens" (LIKE "email_verification_tokens" INCLUDING ALL);

-- RenameIndex
ALTER INDEX "password_reset_tokens_token_hash_idx" RENAME TO "password_reset_tokens_token_hash_key";

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data API di Supabase chiusa anche sulla nuova tabella (T-205, D-20).
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
