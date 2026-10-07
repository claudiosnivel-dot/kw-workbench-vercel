-- T-1401: l'email diventa l'identità di accesso. Unica e sempre minuscola (il vincolo CHECK rende impossibile un
-- duplicato che differisce solo per maiuscole), nulla solo per gli utenti legacy, che restano nel DB ma non possono
-- accedere (D-05). Lo username diventa il nome mostrato, non più univoco: rinomina, non drop e add, così i valori
-- esistenti restano come display_name.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ADD COLUMN     "email_verified_at" TIMESTAMP(3);

ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- RenameColumn
ALTER TABLE "users" RENAME COLUMN "username" TO "display_name";

-- DropIndex
DROP INDEX "users_username_key";
