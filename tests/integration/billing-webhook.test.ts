// Gate di T-1603 (AC-1603-1…4): webhook di Paddle firmati, idempotenti per event_id e tolleranti all'ordine.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as webhook } from "@/app/api/billing/webhook/route";
import { getEntitlements } from "@/lib/billing/entitlements";
import { setPlansForTesting } from "@/lib/billing/plans";
import { resetEnvForTests } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { configureTestBilling, fakePaddleValue, paddleSignature, subscriptionEvent, TEST_PRO_LIMITS } from "../helpers/paddle";

let prices: ReturnType<typeof configureTestBilling>["prices"];
let secret: string;

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  ({ prices, webhookSecret: secret } = configureTestBilling());
  await resetDatabase();
  await setCommercialLaunchForTests("live");
});

afterEach(() => {
  setPlansForTesting(null);
  vi.unstubAllEnvs();
  resetEnvForTests();
});

function deliver(body: string, signature: string | null) {
  return callRoute(webhook, {
    method: "POST",
    url: "/api/billing/webhook",
    body,
    headers: signature ? { "paddle-signature": signature } : {},
  });
}

const send = (event: object) => {
  const body = JSON.stringify(event);
  return deliver(body, paddleSignature(body, secret));
};

describe("webhook firmato", () => {
  // covers: AC-1603-1
  it("subscription.created firmato crea l'abbonamento active del workspace e i diritti del piano", async () => {
    const { workspaceId } = await createUserWithSession({ displayName: "t1603-owner" });
    const endsAt = new Date("2026-11-08T00:00:00.000Z");

    const response = await send(
      subscriptionEvent({
        eventId: "evt_created",
        type: "subscription.created",
        workspaceId,
        status: "active",
        occurredAt: new Date(),
        priceId: prices.proMonth,
        endsAt,
      })
    );

    expect(response.status).toBe(200);
    const subscriptions = await prisma.workspaceSubscription.findMany({ where: { workspace_id: workspaceId } });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({ status: "active", plan_id: "pro", current_period_end: endsAt });
    expect(await prisma.billingEvent.findMany({ select: { outcome: true } })).toEqual([{ outcome: "applied" }]);
    expect((await getEntitlements(workspaceId)).limits).toEqual(TEST_PRO_LIMITS);
  });

  // covers: AC-1603-2
  it("corpo alterato, segreto diverso, timestamp scaduto o firma assente → 401 INVALID_SIGNATURE senza scritture", async () => {
    const { workspaceId } = await createUserWithSession({ displayName: "t1603-owner" });
    const body = JSON.stringify(
      subscriptionEvent({ eventId: "evt_x", type: "subscription.created", workspaceId, status: "active", occurredAt: new Date(), priceId: prices.proMonth })
    );
    const signature = paddleSignature(body, secret);
    const tampered = body.replace('"active"', '"activf"');

    const responses = [
      await deliver(tampered, signature),
      await deliver(body, paddleSignature(body, fakePaddleValue("pdl_ntfset_"))),
      await deliver(body, paddleSignature(body, secret, Math.floor(Date.now() / 1000) - 60)),
      await deliver(body, null),
    ];

    for (const response of responses) {
      expect([response.status, ((await response.json()) as { code: string }).code]).toEqual([401, "INVALID_SIGNATURE"]);
    }
    expect(await prisma.billingEvent.count()).toBe(0);
    expect(await prisma.workspaceSubscription.count()).toBe(0);
  });

  // covers: AC-1603-3
  it("una consegna ripetuta non ha effetti e un altro workspace non può prendersi la subscription", async () => {
    const owner = await createUserWithSession({ displayName: "t1603-owner" });
    const other = await createUserWithSession({ displayName: "t1603-other" });
    const first = subscriptionEvent({
      eventId: "evt_first",
      type: "subscription.created",
      workspaceId: owner.workspaceId,
      status: "active",
      occurredAt: new Date(Date.now() - 60_000),
      priceId: prices.proMonth,
    });
    expect((await send(first)).status).toBe(200);
    const before = await prisma.workspaceSubscription.findUniqueOrThrow({ where: { workspace_id: owner.workspaceId } });

    const repeated = await send(first);
    const hijack = await send(
      subscriptionEvent({
        eventId: "evt_hijack",
        type: "subscription.updated",
        workspaceId: other.workspaceId,
        status: "active",
        occurredAt: new Date(),
        priceId: prices.teamMonth,
      })
    );

    expect([repeated.status, hijack.status]).toEqual([200, 200]);
    expect(await prisma.billingEvent.count({ where: { event_id: "evt_first" } })).toBe(1);
    expect(await prisma.billingEvent.findUniqueOrThrow({ where: { event_id: "evt_hijack" } })).toMatchObject({ outcome: "ignored" });
    const after = await prisma.workspaceSubscription.findUniqueOrThrow({ where: { provider_subscription_id: "sub_01test" } });
    expect(after.workspace_id).toBe(owner.workspaceId);
    expect(after.updated_at).toEqual(before.updated_at);
    expect(await prisma.workspaceSubscription.count({ where: { workspace_id: other.workspaceId } })).toBe(0);
  });

  // covers: AC-1603-4
  it("un evento più vecchio dello stato è registrato come stale e non lo cambia", async () => {
    const { workspaceId } = await createUserWithSession({ displayName: "t1603-owner" });
    const t1 = new Date(Date.now() - 3_600_000);
    const t2 = new Date(Date.now() - 600_000);
    const between = new Date(Date.now() - 1_800_000);
    const event = (eventId: string, type: string, status: string, occurredAt: Date) =>
      subscriptionEvent({ eventId, type, workspaceId, status, occurredAt, priceId: prices.proMonth });

    await send(event("evt_active", "subscription.created", "active", t1));
    await send(event("evt_past_due", "subscription.past_due", "past_due", t2));
    const late = await send(event("evt_late", "subscription.updated", "active", between));

    expect(late.status).toBe(200);
    const subscription = await prisma.workspaceSubscription.findUniqueOrThrow({ where: { workspace_id: workspaceId } });
    expect(subscription.status).toBe("past_due");
    expect(subscription.past_due_since).toEqual(t2);
    expect(await prisma.billingEvent.findUniqueOrThrow({ where: { event_id: "evt_late" } })).toMatchObject({ outcome: "stale" });
  });

  it("un tipo non gestito è registrato come ignored e un workspace inesistente non crea righe", async () => {
    const unknownType = await send({ event_id: "evt_tx", event_type: "transaction.completed", occurred_at: new Date().toISOString(), data: {} });
    const missingWorkspace = await send(
      subscriptionEvent({ eventId: "evt_ghost", type: "subscription.created", workspaceId: "ws-inesistente", status: "active", occurredAt: new Date(), priceId: prices.proMonth })
    );

    expect([unknownType.status, missingWorkspace.status]).toEqual([200, 200]);
    expect(await prisma.billingEvent.findMany({ select: { event_id: true, outcome: true }, orderBy: { event_id: "asc" } })).toEqual([
      { event_id: "evt_ghost", outcome: "ignored" },
      { event_id: "evt_tx", outcome: "ignored" },
    ]);
    expect(await prisma.workspaceSubscription.count()).toBe(0);
  });
});
