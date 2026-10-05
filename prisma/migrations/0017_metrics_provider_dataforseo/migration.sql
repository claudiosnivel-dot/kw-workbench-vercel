-- T-902: fornitore di metriche con licenza DataForSEO (D-30). Migrazione additiva: nuovo valore dell'enum,
-- nessuna riga modificata.
-- AlterEnum
ALTER TYPE "MetricsProvider" ADD VALUE 'DATAFORSEO';
