import { isCommercialLive } from "@/lib/billing/launch";
import { type Entitlements, resolveEntitlements, UNLIMITED_ENTITLEMENTS } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";

/**
 * Diritti del workspace (T-1601): con il lancio commerciale in pausa (D-32, T-1606) diritti illimitati qualunque sia
 * l'abbonamento; altrimenti lo snapshot di workspace_subscriptions (T-1603) risolto da resolveEntitlements. Il piano
 * arriva solo da qui, mai da dati del client (CWE-602).
 */
export async function getEntitlements(workspaceId: string): Promise<Entitlements> {
  if (!(await isCommercialLive())) {
    return UNLIMITED_ENTITLEMENTS;
  }

  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { workspace_id: workspaceId },
    select: { plan_id: true, status: true, past_due_since: true },
  });
  return resolveEntitlements(
    subscription
      ? { planId: subscription.plan_id, status: subscription.status, pastDueSince: subscription.past_due_since }
      : null,
    new Date()
  );
}
