type MetricsSpend = {
  month: string;
  spentUsd: number;
  budgetUsd: number;
  requests: number;
  keywords: number;
};

const usd = new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Spesa del mese UTC verso il fornitore di metriche con licenza (T-903), solo per il root admin. */
export function MetricsSpendCard({ spend }: { spend: MetricsSpend }) {
  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Spesa fornitore metriche</h2>
      <p className="mt-2 text-sm text-slate-600">
        Mese {spend.month} (UTC): {usd.format(spend.spentUsd)} su un tetto di {usd.format(spend.budgetUsd)}, {spend.requests}{" "}
        richieste per {spend.keywords} keyword. Tetti in METRICS_MONTHLY_BUDGET_USD e METRICS_RUN_BUDGET_USD.
      </p>
    </section>
  );
}
