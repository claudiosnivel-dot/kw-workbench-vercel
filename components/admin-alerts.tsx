import Link from "next/link";
import { useTranslations } from "next-intl";
import { useVolumesReasonText } from "@/components/volumes-reason-text";
import type { AdminAlertsData } from "@/lib/admin/alerts-types";
import { countAvailableModels, MIN_AVAILABLE_MODELS } from "@/lib/ai/models";

/** Indirizzo della card «Titoli con l'AI» nelle Impostazioni (T-3902). */
const AI_TITLES_CARD_HREF = "/admin/settings#ai-titles";

type Alert = { key: string; text: string; detail?: string | null; cardLink?: boolean };

/**
 * Avvisi della Panoramica dell'amministrazione, solo per il root admin: richieste gratuite dell'account OpenRouter finite
 * almeno una volta nelle ultime 24 ore e meno di 5 modelli dell'elenco disponibili o da verificare, ciascuno con il link
 * alla card «Titoli con l'AI» (T-3902); richieste rifiutate da DataForSEO nelle ultime 24 ore con il motivo dell'ultima,
 * dai testi del riquadro dei volumi (T-3903). Senza avvisi non rende nulla.
 */
export function AdminAlerts({ data, isRootAdmin }: { data: AdminAlertsData; isRootAdmin: boolean }) {
  const t = useTranslations("admin.alerts");
  const dataForSeoReason = useVolumesReasonText(data.dataForSeo.failed > 0 ? { kind: "provider", code: data.dataForSeo.lastCode } : null);
  if (!isRootAdmin) {
    return null;
  }

  const alerts: Alert[] = [];
  if (data.aiDailyLimit) {
    alerts.push({ key: "aiDailyLimit", text: t("aiDailyLimit"), cardLink: true });
  }
  if (countAvailableModels(data.aiModelStatuses) < MIN_AVAILABLE_MODELS) {
    alerts.push({ key: "aiFewModels", text: t("aiFewModels", { min: MIN_AVAILABLE_MODELS }), cardLink: true });
  }
  if (data.dataForSeo.failed > 0) {
    alerts.push({ key: "dataForSeo", text: t("dataForSeo", { count: data.dataForSeo.failed }), detail: dataForSeoReason });
  }
  if (alerts.length === 0) {
    return null;
  }

  return (
    <section aria-label={t("title")} data-testid="admin-alerts">
      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li
            key={alert.key}
            data-testid="admin-alert"
            className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-1">
              <p className="font-medium">{alert.text}</p>
              {alert.detail && <p>{alert.detail}</p>}
            </div>
            {alert.cardLink && (
              <Link href={AI_TITLES_CARD_HREF} className="btn-secondary shrink-0">
                {t("openCard")}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
