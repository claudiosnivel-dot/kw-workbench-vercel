import { useFormatter, useTranslations } from "next-intl";
import type { UsageSummary as Usage } from "@/lib/billing/usage-types";
import { formatDate } from "@/lib/view/format";

/** Uso del workspace nella pagina di fatturazione (T-1703): avvii di oggi e keyword del mese con i limiti del piano. */
export function UsageSummary({ usage }: { usage: Usage }) {
  const t = useTranslations("billing.usage");
  const format = useFormatter();
  const limit = (value: number | null) => (value === null ? t("unlimited") : value);

  return (
    <section className="card space-y-2 text-sm" data-testid="usage-summary">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p>{t("runs", { used: usage.runsToday, limit: limit(usage.runsPerDay) })}</p>
      <p className="text-slate-600">{t("resetAt", { date: formatDate(usage.resetAt.runs_day, format) })}</p>
      <p>{t("keywords", { used: usage.keywordsThisMonth, limit: limit(usage.keywordsPerMonth) })}</p>
      <p className="text-slate-600">{t("resetAt", { date: formatDate(usage.resetAt.keywords_month, format) })}</p>
    </section>
  );
}
