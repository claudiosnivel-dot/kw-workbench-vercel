import type { ModelStatus } from "@/lib/ai/models";

/**
 * Dati degli avvisi della Panoramica dell'amministrazione, solo per il root admin (T-3902, T-3903). Solo tipi: li
 * importa il componente, i valori li legge lib/admin/alerts.ts.
 */
export type AdminAlertsData = {
  /** Almeno un 429 del limite giornaliero dell'account OpenRouter nelle ultime 24 ore. */
  aiDailyLimit: boolean;
  /** Stato sul catalogo di ogni modello dell'elenco dei titoli con l'AI. */
  aiModelStatuses: ModelStatus[];
  /** Richieste DataForSEO non riuscite nelle ultime 24 ore e codice dell'ultima (null: timeout o errore di rete). */
  dataForSeo: { failed: number; lastCode: number | null };
};
