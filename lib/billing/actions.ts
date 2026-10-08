import type { AuthUser } from "@/lib/auth/credentials";
import { requireVerifiedEmail } from "@/lib/auth/verified-email";
import { requireWorkspaceRole, type WorkspaceSummary } from "@/lib/authz/workspace";
import { isCommercialLive } from "@/lib/billing/launch";
import { getBillingProvider } from "@/lib/billing/paddle";
import { getBillingPolicy, isPlansConfigured } from "@/lib/billing/plans";
import type { PortalLinks } from "@/lib/billing/provider";
import { listPurchasableOptions, type PurchasableOption } from "@/lib/billing/summary";
import type { SubscriptionStatus } from "@/lib/generated/prisma/enums";
import { AppError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

/**
 * Azioni di fatturazione del workspace (T-1602, T-1604): solo l'OWNER (billing.manage, D-08) e solo con il lancio
 * commerciale attivo (D-32). Lo stato locale dell'abbonamento cambia solo dai webhook firmati (T-1603), mai dalla
 * risposta del provider (CWE-840).
 */

/** Stati in cui il workspace ha già un abbonamento: un nuovo checkout è un 409, si passa dal cambio piano. */
const SUBSCRIBED_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due", "paused"];
/** Stati in cui l'abbonamento si può cambiare o disdire. */
const MANAGEABLE_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due"];

const invalidPlan = () => new AppError(400, "INVALID_PLAN", "Piano o intervallo di fatturazione non valido");
const subscriptionNotFound = () => new AppError(404, "SUBSCRIPTION_NOT_FOUND", "Il workspace non ha un abbonamento da gestire");

/** OWNER del workspace (404 non membro, 403 altri ruoli), poi 409 BILLING_PAUSED con il lancio in pausa. */
async function requireBillingOwner(user: AuthUser, workspaceId: unknown): Promise<WorkspaceSummary> {
  const workspace = await requireWorkspaceRole(user, workspaceId, "billing.manage");
  if (!(await isCommercialLive())) {
    throw new AppError(409, "BILLING_PAUSED", "La fatturazione è in pausa finché il lancio commerciale non è attivo");
  }
  return workspace;
}

/** Piano pubblico a pagamento con il price id configurato per l'intervallo (free, sconosciuto o senza prezzo → 400). */
function paidPlanPrice(planId: unknown, interval: unknown): PurchasableOption {
  const option = listPurchasableOptions().find((item) => item.planId === planId && item.interval === interval);
  if (!option) {
    throw invalidPlan();
  }
  return option;
}

function findSubscription(workspaceId: string) {
  return prisma.workspaceSubscription.findUnique({ where: { workspace_id: workspaceId } });
}

/** Abbonamento che si può cambiare o disdire (trialing, active, past_due), altrimenti 404 SUBSCRIPTION_NOT_FOUND. */
async function manageableSubscription(workspaceId: string) {
  const subscription = await findSubscription(workspaceId);
  if (!subscription || !MANAGEABLE_STATUSES.includes(subscription.status)) {
    throw subscriptionNotFound();
  }
  return subscription;
}

type PlanRequest = { workspaceId?: unknown; planId?: unknown; interval?: unknown };

/**
 * Checkout (T-1602): transazione creata lato server con workspace_id e initiated_by_user_id nei custom_data; dal body
 * si leggono solo workspaceId, planId e interval (custom_data o price inviati dal client sono ignorati, CWE-345).
 */
export async function startCheckout(user: AuthUser, body: PlanRequest, requestId: string): Promise<{ transactionId: string }> {
  const workspace = await requireBillingOwner(user, body.workspaceId);
  requireVerifiedEmail(user);
  if (!isPlansConfigured() && process.env.NODE_ENV === "production") {
    throw new AppError(503, "PLANS_NOT_CONFIGURED", "I piani non sono ancora configurati");
  }
  const { priceId } = paidPlanPrice(body.planId, body.interval);

  const existing = await findSubscription(workspace.id);
  if (existing && SUBSCRIBED_STATUSES.includes(existing.status)) {
    throw new AppError(409, "SUBSCRIPTION_EXISTS", "Il workspace ha già un abbonamento");
  }

  return getBillingProvider(requestId).createCheckout({
    priceId,
    workspaceId: workspace.id,
    initiatedByUserId: user.id,
    customerId: existing?.provider_customer_id ?? null,
  });
}

/** Portale cliente (T-1604): link temporanei da restituire con no-store, mai salvati né loggati. */
export async function openBillingPortal(user: AuthUser, workspaceId: unknown, requestId: string): Promise<PortalLinks> {
  const workspace = await requireBillingOwner(user, workspaceId);
  const subscription = await findSubscription(workspace.id);
  if (!subscription) {
    throw subscriptionNotFound();
  }
  return getBillingProvider(requestId).createPortalSession({
    customerId: subscription.provider_customer_id,
    subscriptionId: subscription.provider_subscription_id,
  });
}

/** Cambio piano (T-1604): stesso piano e intervallo → 400 INVALID_PLAN; il nuovo piano arriva col webhook. */
export async function requestPlanChange(user: AuthUser, body: PlanRequest, requestId: string): Promise<void> {
  const workspace = await requireBillingOwner(user, body.workspaceId);
  const { planId, interval, priceId } = paidPlanPrice(body.planId, body.interval);
  const subscription = await manageableSubscription(workspace.id);
  if (subscription.plan_id === planId && subscription.billing_interval === interval) {
    throw invalidPlan();
  }
  await getBillingProvider(requestId).changePlan({
    subscriptionId: subscription.provider_subscription_id,
    priceId,
    prorationBillingMode: getBillingPolicy().prorationBillingMode,
  });
}

/** Disdetta a fine periodo (T-1604): lo stato resta active fino a scheduled_change.effective_at (webhook). */
export async function requestCancellation(user: AuthUser, workspaceId: unknown, requestId: string): Promise<void> {
  const workspace = await requireBillingOwner(user, workspaceId);
  const subscription = await manageableSubscription(workspace.id);
  await getBillingProvider(requestId).cancelSubscription(subscription.provider_subscription_id);
}
