import { z } from "zod";
import type { SubscriptionStatus } from "@/lib/generated/prisma/enums";
import { logger } from "@/lib/observability/logger";

/**
 * Piani, prezzi visualizzati e limiti (T-1601): l'unica fonte per enforcement (T-1605), checkout (T-1602), pagina di
 * fatturazione (T-1604) e pagina prezzi (T-1802). I valori sono quelli di D-14: finché l'utente non li fornisce il
 * file contiene solo segnaposto dichiarati (PLANS_CONFIG_STATUS 'placeholder-D14'), il checkout e la pagina prezzi
 * restano spenti e il lancio commerciale non si può attivare (T-1606). Nessun prezzo, limite o tolleranza è deciso qui.
 */

export const FREE_PLAN_ID = "free";
export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Limiti di conteggio: interi >= 0. Nei diritti risolti null vuol dire illimitato (lancio in pausa, T-1606). */
export const COUNT_LIMIT_KEYS = [
  "maxProjects",
  "maxSectionsPerProject",
  "maxSeedsPerSection",
  "runsPerDay",
  "maxKeywordsPerRun",
  "keywordsPerMonth",
  "licensedMetricsKeywordsPerMonth",
  "seats",
] as const;
export type CountLimitKey = (typeof COUNT_LIMIT_KEYS)[number];

/** Funzioni a pagamento: licensedMetrics abilita il fornitore di metriche con licenza (D-30, T-902). */
export const FEATURE_KEYS = ["sheetsExport", "plannerImport", "licensedMetrics"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Modalità di proration del cambio piano di Paddle (T-1604, PATCH /subscriptions/{id}). */
export type ProrationBillingMode =
  | "prorated_immediately"
  | "prorated_next_billing_period"
  | "full_immediately"
  | "full_next_billing_period"
  | "do_not_bill";

const countLimit = z.number().int().min(0);
const limitsSchema = z.strictObject({
  ...(Object.fromEntries(COUNT_LIMIT_KEYS.map((key) => [key, countLimit])) as Record<CountLimitKey, typeof countLimit>),
  ...(Object.fromEntries(FEATURE_KEYS.map((key) => [key, z.boolean()])) as Record<FeatureKey, z.ZodBoolean>),
});
const intervalPrices = z.partialRecord(z.enum(BILLING_INTERVALS), z.string().min(1));
// Nomi delle variabili d'ambiente con i price id: sempre PADDLE_PRICE_*, validate da lib/env.ts (T-1602).
const priceEnvName = z.string().regex(/^PADDLE_PRICE_[A-Z0-9_]+$/, "deve essere un nome PADDLE_PRICE_*");
const planSchema = z.strictObject({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  public: z.boolean(),
  order: z.number().int(),
  displayPrice: z.partialRecord(z.enum(["it", "en"]), intervalPrices),
  priceEnv: z.partialRecord(z.enum(BILLING_INTERVALS), priceEnvName),
  limits: limitsSchema,
});

export type PlanLimits = z.infer<typeof limitsSchema>;
export type PlanConfig = z.infer<typeof planSchema>;
export type PlanId = string;

/**
 * Politica di fatturazione di D-14: tolleranza dei pagamenti scaduti (T-1604), proration del cambio piano e tetto
 * mensile per workspace dei rimborsi automatici della quota per errori nostri (T-1703, D-27 emendata).
 */
export type BillingPolicy = { pastDueGraceMs: number; prorationBillingMode: ProrationBillingMode; runRefundsPerMonth: number };

/**
 * Valida i piani al caricamento (T-1601): chiave mancante, tipo errato o valore negativo → errore con il nome del piano
 * e della chiave; il piano free deve esistere e ogni piano ha id uguale alla sua chiave.
 */
export function validatePlans(plans: Record<string, unknown>): Record<PlanId, PlanConfig> {
  const validated: Record<PlanId, PlanConfig> = {};
  for (const [planId, plan] of Object.entries(plans)) {
    const result = planSchema.safeParse(plan);
    if (!result.success) {
      const issue = result.error.issues[0];
      const key = issue.code === "unrecognized_keys" ? issue.keys.join(", ") : issue.path.map(String).join(".");
      throw new Error(`Piano ${planId} non valido: ${key} ${issue.message}`);
    }
    if (result.data.id !== planId) {
      throw new Error(`Piano ${planId} non valido: id deve valere ${planId}`);
    }
    validated[planId] = result.data;
  }
  if (!validated[FREE_PLAN_ID]) {
    throw new Error(`Configurazione dei piani non valida: manca il piano ${FREE_PLAN_ID}`);
  }
  return validated;
}

/** placeholder-D14: valori segnaposto, acquisti spenti; configured: valori di D-14 forniti dall'utente. */
export type PlansConfigStatus = "placeholder-D14" | "configured";
export const PLANS_CONFIG_STATUS: PlansConfigStatus = "placeholder-D14";

// Segnaposto dichiarati di D-14: un solo piano free a limiti zero. Non si applicano mai: il lancio commerciale non si
// attiva finché isPlansConfigured() è false, e in pausa i diritti sono illimitati (T-1606).
const PLACEHOLDER_LIMITS: PlanLimits = {
  maxProjects: 0,
  maxSectionsPerProject: 0,
  maxSeedsPerSection: 0,
  runsPerDay: 0,
  maxKeywordsPerRun: 0,
  keywordsPerMonth: 0,
  licensedMetricsKeywordsPerMonth: 0,
  seats: 0,
  sheetsExport: false,
  plannerImport: false,
  licensedMetrics: false,
};

export const PLANS: Record<PlanId, PlanConfig> = validatePlans({
  [FREE_PLAN_ID]: {
    id: FREE_PLAN_ID,
    nameKey: "billing.plans.free",
    public: true,
    order: 0,
    displayPrice: {},
    priceEnv: {},
    limits: PLACEHOLDER_LIMITS,
  },
});

// Segnaposto di D-14: nessuna tolleranza (past_due vale subito free, come ogni stato non pagato), la proration
// predefinita di Paddle e nessun rimborso automatico (ogni errore nostro va all'admin, T-1703).
const PLACEHOLDER_POLICY: BillingPolicy = {
  pastDueGraceMs: 0,
  prorationBillingMode: "prorated_immediately",
  runRefundsPerMonth: 0,
};

type ActiveConfig = { status: PlansConfigStatus | "test"; plans: Record<PlanId, PlanConfig>; policy: BillingPolicy };
const DEFAULT_CONFIG: ActiveConfig = { status: PLANS_CONFIG_STATUS, plans: PLANS, policy: PLACEHOLDER_POLICY };
let active: ActiveConfig = DEFAULT_CONFIG;

/**
 * Sostituisce piani e politica solo con NODE_ENV=test (T-1601): i test usano limiti noti senza dipendere da D-14 e i
 * piani di prova contano come configurati. null ripristina la configurazione del file.
 */
export function setPlansForTesting(plans: Record<string, unknown> | null, policy: Partial<BillingPolicy> = {}): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setPlansForTesting è ammessa solo con NODE_ENV=test");
  }
  active =
    plans === null
      ? DEFAULT_CONFIG
      : { status: "test", plans: validatePlans(plans), policy: { ...PLACEHOLDER_POLICY, ...policy } };
}

/** true quando i valori di D-14 sono forniti (o i piani di prova dei test): lo rispettano checkout, prezzi e lancio. */
export function isPlansConfigured(): boolean {
  return active.status !== "placeholder-D14";
}

export function getPlans(): Record<PlanId, PlanConfig> {
  return active.plans;
}

export function getPlan(planId: string): PlanConfig | null {
  return Object.hasOwn(active.plans, planId) ? active.plans[planId] : null;
}

export function getBillingPolicy(): BillingPolicy {
  return active.policy;
}

/** Diritti risolti: limiti di conteggio null = illimitati (solo con il lancio in pausa). */
export type EntitlementLimits = { [K in CountLimitKey]: number | null } & { [K in FeatureKey]: boolean };
export type Entitlements = { planId: PlanId | null; limits: EntitlementLimits };

/** Snapshot dell'abbonamento del workspace (T-1603). */
export type SubscriptionSnapshot = { planId: string; status: SubscriptionStatus; pastDueSince: Date | null };

/**
 * Diritti illimitati del lancio in pausa (D-32, T-1606): nessun limite di conteggio, export Sheets e import Planner
 * attivi; il fornitore di metriche con licenza resta del solo root admin, perché lo sceglie solo lui (T-902).
 */
export const UNLIMITED_ENTITLEMENTS: Entitlements = {
  planId: null,
  limits: {
    ...(Object.fromEntries(COUNT_LIMIT_KEYS.map((key) => [key, null])) as { [K in CountLimitKey]: null }),
    sheetsExport: true,
    plannerImport: true,
    licensedMetrics: true,
  },
};

function planEntitlements(plan: PlanConfig): Entitlements {
  return { planId: plan.id, limits: { ...plan.limits } };
}

/**
 * Diritti di uno snapshot (T-1601, T-1604), funzione pura: nessun abbonamento → free; active o trialing → piano
 * dell'abbonamento; past_due → piano finché now < pastDueSince + tolleranza, poi free; ogni altro stato → free; piano
 * sconosciuto → free con un warning che riporta il solo planId. Mai un piano a pagamento per difetto (CWE-840).
 */
export function resolveEntitlements(snapshot: SubscriptionSnapshot | null, now: Date): Entitlements {
  const free = planEntitlements(active.plans[FREE_PLAN_ID]);
  if (!snapshot) {
    return free;
  }

  const paidStatus =
    snapshot.status === "active" ||
    snapshot.status === "trialing" ||
    (snapshot.status === "past_due" &&
      snapshot.pastDueSince !== null &&
      now.getTime() < snapshot.pastDueSince.getTime() + active.policy.pastDueGraceMs);
  if (!paidStatus) {
    return free;
  }

  const plan = getPlan(snapshot.planId);
  if (!plan) {
    logger.warn("billing_unknown_plan", { planId: snapshot.planId });
    return free;
  }
  return planEntitlements(plan);
}

/** Fine della tolleranza di un abbonamento in past_due (T-1604): mostrata nel banner. */
export function pastDueGraceEnd(pastDueSince: Date): Date {
  return new Date(pastDueSince.getTime() + active.policy.pastDueGraceMs);
}
