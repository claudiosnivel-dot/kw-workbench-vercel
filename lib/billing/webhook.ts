import { z } from "zod";
import { FREE_PLAN_ID, getPlans } from "@/lib/billing/plans";
import { isUniqueViolation } from "@/lib/db/unique-violation";
import { getPaddlePriceId } from "@/lib/env";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { BillingEventOutcome, SubscriptionStatus } from "@/lib/generated/prisma/enums";
import { ValidationError } from "@/lib/http/errors";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { lockWorkspaceRow } from "@/lib/workspaces/lock";

/**
 * Eventi di Paddle già verificati dalla firma (T-1603): registrati una volta per event_id (consegna at-least-once) e
 * applicati allo stato dell'abbonamento del workspace con una macchina a stati che tollera duplicati e consegne fuori
 * ordine (occurred_at). Nessuna chiamata di rete: una sola transazione breve, entro i 5 secondi chiesti da Paddle.
 */

const HANDLED_EVENTS = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.trialing",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
]);

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "data non valida");

const eventSchema = z.object({
  event_id: z.string().min(1).max(200),
  event_type: z.string().min(1).max(200),
  occurred_at: timestamp,
  notification_id: z.string().max(200).nullish(),
  data: z.record(z.string(), z.unknown()),
});

const subscriptionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["trialing", "active", "past_due", "paused", "canceled"]),
  customer_id: z.string().min(1),
  currency_code: z.string().nullish(),
  custom_data: z.record(z.string(), z.unknown()).nullish(),
  current_billing_period: z.object({ starts_at: timestamp, ends_at: timestamp }).nullish(),
  scheduled_change: z.object({ action: z.string(), effective_at: timestamp }).nullish(),
  billing_cycle: z.object({ interval: z.string(), frequency: z.number().int() }).nullish(),
  items: z
    .array(
      z.object({
        quantity: z.number().int().nullish(),
        price: z.object({ id: z.string(), unit_price: z.object({ amount: z.string() }).nullish() }),
      })
    )
    .min(1),
});

type PaddleEvent = z.infer<typeof eventSchema>;
type PaddleSubscription = z.infer<typeof subscriptionSchema>;

export type WebhookResult = BillingEventOutcome | "duplicate";

/** Piano dal price id (mappa inversa di priceEnv): price sconosciuto → free con un warning (mai un piano pagato). */
function planForPriceId(priceId: string): string {
  for (const plan of Object.values(getPlans())) {
    if (Object.values(plan.priceEnv).some((name) => getPaddlePriceId(name) === priceId)) {
      return plan.id;
    }
  }
  logger.warn("billing_unknown_price", { priceId });
  return FREE_PLAN_ID;
}

function subscriptionData(subscription: PaddleSubscription, occurredAt: Date, pastDueSince: Date | null) {
  const [item] = subscription.items;
  const amount = item.price.unit_price?.amount;
  return {
    provider: "paddle",
    provider_subscription_id: subscription.id,
    provider_customer_id: subscription.customer_id,
    plan_id: planForPriceId(item.price.id),
    status: subscription.status as SubscriptionStatus,
    current_period_start: subscription.current_billing_period ? new Date(subscription.current_billing_period.starts_at) : null,
    current_period_end: subscription.current_billing_period ? new Date(subscription.current_billing_period.ends_at) : null,
    cancel_at:
      subscription.scheduled_change?.action === "cancel" ? new Date(subscription.scheduled_change.effective_at) : null,
    // Prima transizione verso past_due: l'istante dell'evento; restando in past_due si conserva, uscendo si azzera.
    past_due_since: subscription.status === "past_due" ? (pastDueSince ?? occurredAt) : null,
    currency_code: subscription.currency_code ?? null,
    recurring_amount_minor: amount && /^\d{1,18}$/.test(amount) ? BigInt(amount) : null,
    billing_interval: subscription.billing_cycle?.interval ?? null,
    billing_frequency: subscription.billing_cycle?.frequency ?? null,
    quantity: item.quantity ?? null,
    last_event_occurred_at: occurredAt,
  };
}

/**
 * Esito di un evento gestito, nella transazione con il lock del workspace: workspace assente o inesistente, oppure
 * subscription già legata a un altro workspace → ignored (CWE-639); evento non più recente dello stato → stale.
 */
async function applySubscriptionEvent(tx: Prisma.TransactionClient, event: PaddleEvent): Promise<BillingEventOutcome> {
  const parsed = subscriptionSchema.safeParse(event.data);
  const workspaceId = parsed.success ? parsed.data.custom_data?.workspace_id : undefined;
  if (!parsed.success || typeof workspaceId !== "string" || !(await lockWorkspaceRow(tx, workspaceId))) {
    logger.error("billing_webhook_ignored", { eventId: event.event_id, reason: parsed.success ? "workspace" : "payload" });
    return "ignored";
  }

  const subscription = parsed.data;
  const linked = await tx.workspaceSubscription.findUnique({
    where: { provider_subscription_id: subscription.id },
    select: { workspace_id: true },
  });
  const current = await tx.workspaceSubscription.findUnique({ where: { workspace_id: workspaceId } });
  // Una subscription diversa ancora viva sul workspace non viene sostituita: solo dopo la disdetta nasce la nuova.
  const replacesLive = current && current.provider_subscription_id !== subscription.id && current.status !== "canceled";
  if ((linked && linked.workspace_id !== workspaceId) || replacesLive) {
    logger.error("billing_webhook_ignored", { eventId: event.event_id, reason: "subscription_workspace_mismatch" });
    return "ignored";
  }

  const occurredAt = new Date(event.occurred_at);
  const sameSubscription = current?.provider_subscription_id === subscription.id;
  if (current && sameSubscription && occurredAt <= current.last_event_occurred_at) {
    return "stale";
  }

  const data = subscriptionData(subscription, occurredAt, sameSubscription ? (current?.past_due_since ?? null) : null);
  await tx.workspaceSubscription.upsert({
    where: { workspace_id: workspaceId },
    create: { workspace_id: workspaceId, ...data },
    update: data,
  });
  return "applied";
}

/** Corpo JSON già verificato → evento; un corpo non conforme è un 400 (Paddle lo ritenta e resta nei log). */
function parseEvent(rawBody: string): PaddleEvent {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new ValidationError("Evento non valido");
  }
  const result = eventSchema.safeParse(json);
  if (!result.success) {
    throw new ValidationError("Evento non valido");
  }
  return result.data;
}

/**
 * Registra ed elabora un evento firmato: insert di billing_events con l'esito nella stessa transazione
 * dell'aggiornamento di stato. Un event_id già registrato → duplicate, senza effetti.
 */
export async function processPaddleEvent(rawBody: string): Promise<WebhookResult> {
  const event = parseEvent(rawBody);
  if (await prisma.billingEvent.count({ where: { event_id: event.event_id } })) {
    return "duplicate";
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const outcome = HANDLED_EVENTS.has(event.event_type) ? await applySubscriptionEvent(tx, event) : "ignored";
      await tx.billingEvent.create({
        data: {
          event_id: event.event_id,
          event_type: event.event_type,
          occurred_at: new Date(event.occurred_at),
          notification_id: event.notification_id ?? null,
          outcome,
          payload: JSON.parse(rawBody) as Prisma.InputJsonValue,
        },
      });
      return outcome;
    });
  } catch (error) {
    // Consegna concorrente dello stesso evento: l'altra transazione l'ha già registrato.
    if (isUniqueViolation(error) && (await prisma.billingEvent.count({ where: { event_id: event.event_id } }))) {
      return "duplicate";
    }
    throw error;
  }
}
