-- T-6301: richieste a OpenRouter della classificazione di luoghi e concorrenti del piano (D-57). Migrazione additiva:
-- nuovo valore dell'enum, nessuna riga modificata.
-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'plan';
