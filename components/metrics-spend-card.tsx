import { useFormatter, useTranslations } from "next-intl";
import { CardIntro } from "@/components/card-intro";
import { ProgressBar } from "@/components/progress-bar";

type MetricsSpend = {
  month: string;
  spentUsd: number;
  budgetUsd: number;
  requests: number;
  keywords: number;
};

const USD = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 } as const;

/**
 * Spesa del mese UTC verso il fornitore di metriche con licenza (T-903), solo per il root admin: speso e tetto con la
 * barra della percentuale spesa, arrotondata e ferma a 100 (T-3302), richieste e keyword sotto.
 */
export function MetricsSpendCard({ spend }: { spend: MetricsSpend }) {
  const t = useTranslations("admin.spend");
  const format = useFormatter();
  const percent = spend.budgetUsd > 0 ? Math.min(100, Math.round((spend.spentUsd / spend.budgetUsd) * 100)) : 0;

  return (
    <section className="card space-y-3">
      <CardIntro title={t("title")} intro={t("month", { month: spend.month })} />
      <p className="text-2xl font-semibold">
        {t("amount", { spent: format.number(spend.spentUsd, USD), budget: format.number(spend.budgetUsd, USD) })}
      </p>
      <ProgressBar label={t("bar")} done={percent} total={100} />
      <p className="text-sm text-slate-600">{t("usage", { requests: spend.requests, keywords: spend.keywords })}</p>
      <p className="text-xs text-slate-600">{t("caps")}</p>
    </section>
  );
}
