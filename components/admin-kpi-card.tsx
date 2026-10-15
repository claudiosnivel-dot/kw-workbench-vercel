import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CardIntro } from "@/components/card-intro";
import type { PlatformKpi } from "@/lib/admin/kpi-types";

/** Riquadro di un indicatore: etichetta, numero grande ed eventuale dettaglio sotto. */
function KpiTile({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return (
    <div data-testid="admin-kpi-tile" className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-600">{detail}</p> : null}
    </div>
  );
}

/**
 * Indicatori aggregati della piattaforma (T-1705) in sei riquadri (T-3302), solo per il root admin: nessun dato dei
 * progetti degli utenti. Con il lancio in pausa abbonamenti ed entrate restano a 0.
 */
export function AdminKpiCard({ kpi }: { kpi: PlatformKpi }) {
  const t = useTranslations("admin.kpi");
  const format = useFormatter();
  const extractions = kpi.extractionsPerDay.reduce((sum, day) => sum + day.count, 0);
  // Importi in unità minima: due decimali per le valute dell'app (EUR, USD).
  const revenue = Object.entries(kpi.mrr).map(([currency, minor]) => format.number(minor / 100, { style: "currency", currency }));

  return (
    <section className="card space-y-4" data-testid="admin-kpi">
      <CardIntro title={t("title")} intro={t("intro")} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile label={t("users")} value={kpi.users.total} detail={t("usersDetail", kpi.users)} />
        <KpiTile label={t("workspaces")} value={kpi.workspaces.total} />
        <KpiTile label={t("extractions")} value={extractions} />
        <KpiTile
          label={t("failedRate")}
          value={
            kpi.failedJobRate7d === null
              ? t("failedRateNone")
              : format.number(kpi.failedJobRate7d, { style: "percent", maximumFractionDigits: 1 })
          }
        />
        <KpiTile label={t("subscriptions")} value={kpi.subscriptions.byStatus.active ?? 0} />
        <KpiTile label={t("revenue")} value={revenue.length === 0 ? format.number(0) : revenue.join(" · ")} />
      </div>
    </section>
  );
}
