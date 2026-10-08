import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "./auth";

/**
 * Workspace di squadra con un utente per ruolo (OWNER, ADMIN, MEMBER) e un utente esterno, per i test di fatturazione e
 * dei limiti (T-1602…T-1605).
 */
export async function billingTeam(prefix: string) {
  const owner = await createUserWithSession({ displayName: `${prefix}-owner` });
  const admin = await createUserWithSession({ displayName: `${prefix}-admin` });
  const member = await createUserWithSession({ displayName: `${prefix}-member` });
  const outsider = await createUserWithSession({ displayName: `${prefix}-outsider` });
  const workspace = await prisma.workspace.create({ data: { name: "Squadra", slug: `ws-${prefix}` } });
  await prisma.membership.createMany({
    data: [
      { workspace_id: workspace.id, user_id: owner.user.id, role: "OWNER" },
      { workspace_id: workspace.id, user_id: admin.user.id, role: "ADMIN" },
      { workspace_id: workspace.id, user_id: member.user.id, role: "MEMBER" },
    ],
  });
  return { owner, admin, member, outsider, workspaceId: workspace.id };
}

/** Abbonamento del workspace scritto direttamente, come dopo un webhook applicato (T-1603). */
export function seedSubscription(
  workspaceId: string,
  data: { status?: "trialing" | "active" | "past_due" | "paused" | "canceled"; planId?: string; pastDueSince?: Date; cancelAt?: Date } = {}
) {
  return prisma.workspaceSubscription.create({
    data: {
      workspace_id: workspaceId,
      provider: "paddle",
      provider_subscription_id: `sub_${workspaceId}`,
      provider_customer_id: `ctm_${workspaceId}`,
      plan_id: data.planId ?? "pro",
      status: data.status ?? "active",
      current_period_start: new Date("2026-10-01T00:00:00.000Z"),
      current_period_end: new Date("2026-11-01T00:00:00.000Z"),
      cancel_at: data.cancelAt ?? null,
      past_due_since: data.pastDueSince ?? null,
      billing_interval: "month",
      billing_frequency: 1,
      last_event_occurred_at: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
}
