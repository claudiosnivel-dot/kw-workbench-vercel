import { createHmac, randomBytes } from "node:crypto";
import { vi } from "vitest";
import { setPlansForTesting } from "@/lib/billing/plans";
import { resetEnvForTests } from "@/lib/env";

/** Valore fittizio con prefisso, generato a ogni esecuzione: mai una chiave reale nei test. */
export const fakePaddleValue = (prefix: string) => `${prefix}${randomBytes(12).toString("hex")}`;

/** Limiti del piano free di prova: piccoli e noti, mai i valori di D-14. */
export const TEST_FREE_LIMITS = {
  maxProjects: 1,
  maxSectionsPerProject: 2,
  maxSeedsPerSection: 10,
  runsPerDay: 3,
  maxKeywordsPerRun: 500,
  keywordsPerMonth: 2_000,
  licensedMetricsKeywordsPerMonth: 0,
  seats: 1,
  sheetsExport: false,
  plannerImport: false,
  licensedMetrics: false,
};

export const TEST_PRO_LIMITS = {
  ...TEST_FREE_LIMITS,
  maxProjects: 20,
  maxSectionsPerProject: 50,
  maxSeedsPerSection: 200,
  seats: 5,
  sheetsExport: true,
  plannerImport: true,
  licensedMetrics: true,
};

function testPlan(id: string, order: number, priceEnv: Record<string, string>, limits: Record<string, unknown>) {
  return { id, nameKey: `billing.plans.${id}`, public: true, order, displayPrice: {}, priceEnv, limits };
}

/**
 * Piani di prova (free, pro, team) e ambiente Paddle sandbox fittizio (T-1602…T-1605): price id casuali nelle variabili
 * PADDLE_PRICE_*, chiave sandbox, segreto dei webhook e base URL del fake HTTP. Restituisce price id e segreto.
 */
export function configureTestBilling(limits: Partial<typeof TEST_FREE_LIMITS> = {}, policy: { pastDueGraceMs?: number } = {}) {
  const prices = {
    proMonth: fakePaddleValue("pri_"),
    proYear: fakePaddleValue("pri_"),
    teamMonth: fakePaddleValue("pri_"),
  };
  const webhookSecret = fakePaddleValue("pdl_ntfset_");
  vi.stubEnv("PADDLE_ENV", "sandbox");
  vi.stubEnv("PADDLE_API_KEY", fakePaddleValue("pdl_sdbx_apikey_"));
  vi.stubEnv("PADDLE_WEBHOOK_SECRET", webhookSecret);
  vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", fakePaddleValue("test_"));
  vi.stubEnv("PADDLE_API_BASE_URL", "http://paddle.test");
  vi.stubEnv("PADDLE_PRICE_PRO_MONTH", prices.proMonth);
  vi.stubEnv("PADDLE_PRICE_PRO_YEAR", prices.proYear);
  vi.stubEnv("PADDLE_PRICE_TEAM_MONTH", prices.teamMonth);
  resetEnvForTests();
  setPlansForTesting(
    {
      free: testPlan("free", 0, {}, { ...TEST_FREE_LIMITS, ...limits }),
      pro: testPlan("pro", 1, { month: "PADDLE_PRICE_PRO_MONTH", year: "PADDLE_PRICE_PRO_YEAR" }, TEST_PRO_LIMITS),
      team: testPlan("team", 2, { month: "PADDLE_PRICE_TEAM_MONTH" }, { ...TEST_PRO_LIMITS, seats: 20 }),
    },
    { prorationBillingMode: "prorated_next_billing_period", ...policy }
  );
  return { prices, webhookSecret };
}

/** Header Paddle-Signature ts=<unix>;h1=<hex> per il corpo, come lo calcola Paddle. */
export function paddleSignature(body: string, secret: string, timestampSeconds = Math.floor(Date.now() / 1000)): string {
  const h1 = createHmac("sha256", secret).update(`${timestampSeconds}:${body}`).digest("hex");
  return `ts=${timestampSeconds};h1=${h1}`;
}

/** Evento subscription.* nel formato dei webhook di Paddle, con i soli campi letti dall'app. */
export function subscriptionEvent(input: {
  eventId: string;
  type: string;
  workspaceId: string;
  status: string;
  occurredAt: Date;
  priceId: string;
  subscriptionId?: string;
  endsAt?: Date;
  scheduledCancelAt?: Date;
}) {
  const startsAt = new Date(input.occurredAt.getTime() - 86_400_000);
  return {
    event_id: input.eventId,
    event_type: input.type,
    occurred_at: input.occurredAt.toISOString(),
    notification_id: `ntf_${input.eventId}`,
    data: {
      id: input.subscriptionId ?? "sub_01test",
      status: input.status,
      customer_id: "ctm_01test",
      currency_code: "EUR",
      custom_data: { workspace_id: input.workspaceId },
      current_billing_period: {
        starts_at: startsAt.toISOString(),
        ends_at: (input.endsAt ?? new Date(startsAt.getTime() + 30 * 86_400_000)).toISOString(),
      },
      scheduled_change: input.scheduledCancelAt
        ? { action: "cancel", effective_at: input.scheduledCancelAt.toISOString(), resume_at: null }
        : null,
      billing_cycle: { interval: "month", frequency: 1 },
      items: [{ quantity: 1, price: { id: input.priceId, unit_price: { amount: "1900", currency_code: "EUR" } } }],
    },
  };
}
