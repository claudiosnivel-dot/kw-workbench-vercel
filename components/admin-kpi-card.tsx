import { useFormatter, useTranslations } from "next-intl";
import { CardIntro } from "@/components/card-intro";
import type { PlatformKpi } from "@/lib/admin/kpi-types";

/** Conteggi per chiave come elenco «chiave: valore», oppure «Nessuno». */
function Counts({ counts, empty }: { counts: Record<string, number>; empty: string }) {
  const entries = Object.entries(counts).filter(([, value]) => value > 0);
  return <p className="text-slate-600">{entries.length === 0 ? empty : entries.map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>;
}

/** Indicatori aggregati della piattaforma (T-1705), solo per il root admin: nessun dato dei progetti degli utenti. */
export function AdminKpiCard({ kpi }: { kpi: PlatformKpi }) {
  const t = useTranslations("admin.kpi");
  const format = useFormatter();
  const extractions = kpi.extractionsPerDay.reduce((sum, day) => sum + day.count, 0);
  // Importi in unità minima: due decimali per le valute dell'app (EUR, USD).
  const mrr = Object.entries(kpi.mrr).map(([currency, minor]) => format.number(minor / 100, { style: "currency", currency }));

  return (
    <section className="card space-y-3 text-sm" data-testid="admin-kpi">
      <CardIntro title={t("title")} intro={t("intro")} />
      <p>{t("users", kpi.users)}</p>
      <p>{t("workspaces", kpi.workspaces)}</p>
      <h3 className="font-semibold">{t("subscriptionsByStatus")}</h3>
      <Counts counts={kpi.subscriptions.byStatus} empty={t("none")} />
      <h3 className="font-semibold">{t("subscriptionsByPlan")}</h3>
      <Counts counts={kpi.subscriptions.byPlan} empty={t("none")} />
      <h3 className="font-semibold">{t("mrr")}</h3>
      <p className="text-slate-600">{mrr.length === 0 ? t("none") : mrr.join(" · ")}</p>
      <p>{t("extractions", { total: extractions })}</p>
      <p>
        {kpi.failedJobRate7d === null
          ? t("failedRateNone")
          : t("failedRate", { rate: format.number(kpi.failedJobRate7d, { style: "percent", maximumFractionDigits: 1 }) })}
      </p>
    </section>
  );
}
