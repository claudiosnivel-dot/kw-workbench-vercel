-- T-501: contatore per utente che rende revocabili le sessioni. Il token firmato porta
-- il valore corrente in "ver"; ogni incremento invalida i token emessi prima.
-- AlterTable
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
