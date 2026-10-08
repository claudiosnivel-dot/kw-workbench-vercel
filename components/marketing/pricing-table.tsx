import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { PricingPlanView } from "@/lib/billing/pricing-view";

/**
 * Tabella dei piani pubblici (T-1802): ogni valore viene dalla vista costruita sulla configurazione dei piani, nessun
 * prezzo o limite è scritto qui. Testi nella lingua della richiesta, che sulle pagine pubbliche è quella del percorso.
 * Nome del piano dal catalogo (nameKey); senza voce nel catalogo, l'id del piano.
 */
export function PricingTable({ plans }: { plans: PricingPlanView[] }) {
  const tAll = useTranslations();
  const t = useTranslations("pricing");
  const format = useFormatter();
  const planName = (plan: PricingPlanView) => {
    const key = plan.nameKey as Parameters<typeof tAll>[0];
    return tAll.has(key) ? tAll(key) : plan.id;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <article key={plan.id} data-testid="pricing-plan" className="card flex flex-col gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{planName(plan)}</h2>
            {plan.prices.map((price) => (
              <p key={price.interval} className="text-sm text-slate-600">
                <span className="text-2xl font-semibold">{price.label}</span>{" "}
                {t(`intervals.${price.interval}`)}
              </p>
            ))}
          </div>

          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {plan.limits.map((limit) => (
              <div key={limit.key} className="contents">
                <dt className="text-slate-600">{t(`limits.${limit.key}`)}</dt>
                <dd className="text-right font-medium" data-limit={limit.key}>
                  {format.number(limit.value)}
                </dd>
              </div>
            ))}
            {plan.features.map((feature) => (
              <div key={feature.key} className="contents">
                <dt className="text-slate-600">{t(`features.${feature.key}`)}</dt>
                <dd className="text-right font-medium" data-feature={feature.key}>
                  {feature.included ? t("included") : t("notIncluded")}
                </dd>
              </div>
            ))}
          </dl>

          <Link href={plan.cta.href} data-testid="pricing-cta" className="btn-primary mt-auto w-full text-center">
            {t(`cta.${plan.cta.kind}`)}
          </Link>
        </article>
      ))}
    </div>
  );
}
