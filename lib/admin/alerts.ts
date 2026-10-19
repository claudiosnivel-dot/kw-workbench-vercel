import type { AdminAlertsData } from "@/lib/admin/alerts-types";
import { readModelCatalog } from "@/lib/ai/catalog";
import { modelStatus } from "@/lib/ai/models";
import { hadAccountDailyLimit } from "@/lib/ai/requests";
import { getAiTitlesSettings } from "@/lib/ai/settings";
import { readFailedProviderRequests } from "@/lib/modules/providers/metrics/metrics-ledger";

/**
 * Dati degli avvisi della Panoramica (T-3902, T-3903), letti per il solo root admin (la pagina lo verifica): limite
 * giornaliero dell'account OpenRouter nelle ultime 24 ore, stato dei modelli dell'elenco sul catalogo salvato e
 * richieste DataForSEO non riuscite nelle ultime 24 ore. Solo conteggi e codici, mai messaggi dei fornitori (CWE-532).
 */
export async function getAdminAlertsData(now: Date = new Date()): Promise<AdminAlertsData> {
  const [aiDailyLimit, settings, catalog, dataForSeo] = await Promise.all([
    hadAccountDailyLimit(now),
    getAiTitlesSettings(),
    readModelCatalog(),
    readFailedProviderRequests("DATAFORSEO", now),
  ]);
  return { aiDailyLimit, aiModelStatuses: settings.models.map((model) => modelStatus(model, catalog)), dataForSeo };
}
