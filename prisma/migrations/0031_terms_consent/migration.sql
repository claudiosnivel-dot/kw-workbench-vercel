-- T-1405: versione dei termini accettata e momento dell'accettazione, come prova del consenso. Migrazione additiva:
-- colonne nullable, gli utenti esistenti riaccettano al primo accesso.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accepted_terms_at" TIMESTAMP(3),
ADD COLUMN     "accepted_terms_version" TEXT;
