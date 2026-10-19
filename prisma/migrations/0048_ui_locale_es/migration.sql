-- T-4701 (D-47): le due varianti dello spagnolo come lingua dell'interfaccia. Migrazione additiva: due valori nuovi
-- dell'enum, nessun utente cambia lingua (le rotte salvano solo le lingue offerte, it ed en fino a T-4902).
-- AlterEnum
ALTER TYPE "UiLocale" ADD VALUE 'es-ES';
ALTER TYPE "UiLocale" ADD VALUE 'es-419';
