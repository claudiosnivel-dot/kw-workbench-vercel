import {
  BILLING_INTERVALS,
  type BillingInterval,
  COUNT_LIMIT_KEYS,
  type CountLimitKey,
  FEATURE_KEYS,
  type FeatureKey,
  FREE_PLAN_ID,
  type PlanConfig,
  type PlanId,
} from "@/lib/billing/plans";
import type { AppLocale } from "@/lib/i18n/locale";

/** Chi guarda la pagina prezzi (T-1802): decide solo la destinazione delle CTA. */
export type PricingViewer = "anonymous" | "authenticated";

export type PricingPlanView = {
  id: PlanId;
  nameKey: string;
  prices: { interval: BillingInterval; label: string }[];
  limits: { key: CountLimitKey; value: number }[];
  features: { key: FeatureKey; included: boolean }[];
  cta: { href: string; kind: "register" | "subscribe" | "dashboard" };
};

/**
 * CTA di un piano (T-1802): l'anonimo va alla registrazione (con il piano come preselezione per i piani a pagamento),
 * l'utente autenticato alla fatturazione di T-1604 o, per il piano free, alla dashboard. Il parametro plan non decide
 * nulla: checkout e cambio piano rivalidano piano e ruolo sul server (CWE-602).
 */
function planCta(planId: PlanId, viewer: PricingViewer): PricingPlanView["cta"] {
  if (planId === FREE_PLAN_ID) {
    return viewer === "anonymous" ? { href: "/register", kind: "register" } : { href: "/", kind: "dashboard" };
  }
  const query = `plan=${encodeURIComponent(planId)}`;
  return viewer === "anonymous" ? { href: `/register?${query}`, kind: "register" } : { href: `/billing?${query}`, kind: "subscribe" };
}

/**
 * Vista della pagina prezzi (T-1802) dalla stessa configurazione dei limiti applicati (lib/billing/plans.ts): i soli
 * piani pubblici nell'ordine di order, prezzi visualizzati della lingua per intervallo e righe dei limiti dalle stesse
 * chiavi di getEntitlements. Nessun valore è scritto nel markup: cambiare un limite cambia pagina e enforcement insieme.
 */
export function buildPricingView(plans: Record<PlanId, PlanConfig>, locale: AppLocale, viewer: PricingViewer): PricingPlanView[] {
  return Object.values(plans)
    .filter((plan) => plan.public)
    .sort((a, b) => a.order - b.order)
    .map((plan) => ({
      id: plan.id,
      nameKey: plan.nameKey,
      prices: BILLING_INTERVALS.flatMap((interval) => {
        const label = plan.displayPrice[locale]?.[interval];
        return label ? [{ interval, label }] : [];
      }),
      limits: COUNT_LIMIT_KEYS.map((key) => ({ key, value: plan.limits[key] })),
      features: FEATURE_KEYS.map((key) => ({ key, included: plan.limits[key] })),
      cta: planCta(plan.id, viewer),
    }));
}
