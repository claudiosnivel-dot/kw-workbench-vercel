-- T-1301: lingua dell'interfaccia scelta dall'utente (D-07). Migrazione additiva: colonna nullable, nessun
-- valore per gli utenti esistenti (la lingua si risolve da cookie, Accept-Language e infine it).
-- CreateEnum
CREATE TYPE "UiLocale" AS ENUM ('it', 'en');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ui_locale" "UiLocale";
