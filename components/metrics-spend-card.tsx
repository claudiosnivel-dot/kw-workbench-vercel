import { useFormatter, useTranslations } from "next-intl";

type MetricsSpend = {
  month: string;
  spentUsd: number;
  budgetUsd: number;
  requests: number;
  keywords: number;
};

const USD = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 } as const;

/** Spesa del mese UTC verso il fornitore di metriche con licenza (T-903), solo per il root admin. */
export function MetricsSpendCard({ spend }: { spend: MetricsSpend }) {
  const t = useTranslations("admin.spend");
  const format = useFormatter();
  return (
    <section className="card">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="mt-2 text-sm text-slate-600">
        {t("body", {
          month: spend.month,
          spent: format.number(spend.spentUsd, USD),
          budget: format.number(spend.budgetUsd, USD),
          requests: spend.requests,
          keywords: spend.keywords,
        })}
      </p>
    </section>
  );
}
