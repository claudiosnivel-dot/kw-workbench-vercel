-- T-6401: risposte di OpenRouter tagliate al limite di max_tokens (finish_reason length), esito a sé dei tentativi
-- (D-58). Migrazione additiva: nuovo valore dell'enum, nessuna riga modificata.
-- AlterEnum
ALTER TYPE "AiRequestOutcome" ADD VALUE 'truncated';
