-- T-910: volumi importati dal file di Keyword Planner del cliente (D-09). Migrazione additiva: nuovo valore
-- dell'enum, nessuna riga modificata (metrics_precision esiste già, migrazione 0016 di T-901).
-- AlterEnum
ALTER TYPE "MetricsProvider" ADD VALUE 'PLANNER_CSV';
