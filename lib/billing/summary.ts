import { isCommercialLive } from "@/lib/billing/launch";
import { BILLING_INTERVALS, type BillingInterval, FREE_PLAN_ID, getPlans, pastDueGraceEnd } from "@/lib/billing/plans";
import { getPaddlePriceId } from "@/lib/env";
import type { SubscriptionStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** Abbonamento del workspace per la pagina di fatturazione e il banner (T-1604): solo dati di visualizzazione. */
export type BillingSummary = {
  planId: string;
  status: SubscriptionStatus;
  billingInterval: string | null;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  pastDueSince: Date | null;
};

export async function getBillingSummary(workspaceId: string): Promise<BillingSummary | null> {
  const row = await prisma.workspaceSubscription.findUnique({
    where: { workspace_id: workspaceId },
    select: { plan_id: true, status: true, billing_interval: true, current_period_end: true, cancel_at: true, past_due_since: true },
  });
  return row
    ? {
        planId: row.plan_id,
        status: row.status,
        billingInterval: row.billing_interval,
        currentPeriodEnd: row.current_period_end,
        cancelAt: row.cancel_at,
        pastDueSince: row.past_due_since,
      }
    : null;
}

/**
 * Fine della tolleranza del pagamento scaduto per il banner del layout (T-1604): solo con il lancio attivo e
 * l'abbonamento in past_due; altrimenti null.
 */
export async function getPastDueGraceEnd(workspaceId: string): Promise<Date | null> {
  if (!(await isCommercialLive())) {
    return null;
  }
  const summary = await getBillingSummary(workspaceId);
  return summary?.status === "past_due" && summary.pastDueSince ? pastDueGraceEnd(summary.pastDueSince) : null;
}

export type PurchasableOption = { planId: string; nameKey: string; interval: BillingInterval; priceId: string };

/**
 * Piani pubblici a pagamento con il price id configurato, per intervallo e nell'ordine dei piani: le sole scelte di
 * checkout e cambio piano (T-1602, T-1604). Il price id resta sul server.
 */
export function listPurchasableOptions(): PurchasableOption[] {
  return Object.values(getPlans())
    .filter((plan) => plan.public && plan.id !== FREE_PLAN_ID)
    .sort((a, b) => a.order - b.order)
    .flatMap((plan) =>
      BILLING_INTERVALS.flatMap((interval) => {
        const envName = plan.priceEnv[interval];
        const priceId = envName ? getPaddlePriceId(envName) : null;
        return priceId ? [{ planId: plan.id, nameKey: plan.nameKey, interval, priceId }] : [];
      })
    );
}
