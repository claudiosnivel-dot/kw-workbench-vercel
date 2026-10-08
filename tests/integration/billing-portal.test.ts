// Gate di T-1604 (AC-1604-1…4): portale cliente, tolleranza dei pagamenti scaduti, disdetta e cambio piano dell'OWNER.
// Il percorso nel browser (banner sulla dashboard, pagina /billing) è anche in tests/e2e/billing-page.spec.ts.
import { getFormatter } from "next-intl/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as cancel } from "@/app/api/billing/cancel/route";
import { POST as changePlan } from "@/app/api/billing/change-plan/route";
import { POST as portal } from "@/app/api/billing/portal/route";
import { POST as webhook } from "@/app/api/billing/webhook/route";
import { PastDueBanner } from "@/components/past-due-banner";
import { findAuthUserById } from "@/lib/auth/credentials";
import { getEntitlements } from "@/lib/billing/entitlements";
import { setPlansForTesting } from "@/lib/billing/plans";
import { getPastDueGraceEnd } from "@/lib/billing/summary";
import { resetEnvForTests } from "@/lib/env";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/view/format";
import { billingTeam, seedSubscription } from "../helpers/billing-team";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { setRequestCookie } from "../helpers/next-cookies";
import { configureTestBilling, paddleSignature, subscriptionEvent, TEST_FREE_LIMITS, TEST_PRO_LIMITS } from "../helpers/paddle";
import { fakePaddleApi } from "../helpers/paddle-fake";

const page = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/lib/auth/page-guard", () => ({ requirePageUser: async () => page.user }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/billing",
}));

// Tabelle di public in cui compare il testo cercato: SQL statico, il testo è un parametro legato.
const TABLES_CONTAINING = Prisma.sql`
  SELECT count(*)::int AS count FROM information_schema.tables AS t
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    AND query_to_xml(format('SELECT * FROM public.%I', t.table_name), true, false, '')::text LIKE`;

const HOUR = 3_600_000;
const GRACE_MS = 72 * HOUR;
const PORTAL_URL = "https://customer-portal.paddle.com/cpl_01test?token=pga_temporaneo";

let prices: ReturnType<typeof configureTestBilling>["prices"];
let secret: string;

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  ({ prices, webhookSecret: secret } = configureTestBilling({}, { pastDueGraceMs: GRACE_MS }));
  await resetDatabase();
  await setCommercialLaunchForTests("live");
});

afterEach(() => {
  setPlansForTesting(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

const post = (handler: typeof portal, url: string, cookie: string, body: Record<string, unknown>) =>
  callRoute(handler, { method: "POST", url, body, cookie });

/** Pagina /billing resa per l'utente con il workspace attivo dal cookie kwb_workspace. */
async function renderBillingPage(userId: string, workspaceId: string): Promise<string> {
  page.user = await findAuthUserById(userId);
  setRequestCookie("kwb_workspace", workspaceId);
  const { default: BillingPage } = await import("@/app/billing/page");
  return renderToStaticMarkup(await BillingPage());
}

describe("fatturazione dell'OWNER", () => {
  // covers: AC-1604-1
  it("il portale restituisce il link no-store senza salvarlo; il MEMBER riceve 403", async () => {
    const paddle = fakePaddleApi({
      [`POST /customers/ctm_W/portal-sessions`]: { urls: { general: { overview: PORTAL_URL }, subscriptions: [] } },
    });
    const { owner, member, workspaceId } = await billingTeam("t1604");
    await prisma.workspaceSubscription.create({
      data: {
        workspace_id: workspaceId,
        provider: "paddle",
        provider_subscription_id: "sub_W",
        provider_customer_id: "ctm_W",
        plan_id: "pro",
        status: "active",
        last_event_occurred_at: new Date(),
      },
    });

    const byOwner = await post(portal, "/api/billing/portal", owner.cookie, { workspaceId });
    const byMember = await post(portal, "/api/billing/portal", member.cookie, { workspaceId });

    expect(byOwner.status).toBe(200);
    expect(byOwner.headers.get("cache-control")).toBe("no-store");
    expect(((await byOwner.json()) as { data: { url: string } }).data.url).toBe(PORTAL_URL);
    expect(paddle.requests.map((request) => [request.method, new URL(request.url).pathname, request.body])).toEqual([
      ["POST", "/customers/ctm_W/portal-sessions", { subscription_ids: ["sub_W"] }],
    ]);
    const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`${TABLES_CONTAINING} ${"%cpl_01test%"}`;
    expect(count).toBe(0);
    expect([byMember.status, ((await byMember.json()) as { code: string }).code]).toEqual([403, "FORBIDDEN"]);
  });

  // covers: AC-1604-2
  it("in past_due il piano resta finché dura la tolleranza, con il banner; poi valgono i limiti di free", async () => {
    const { workspaceId } = await billingTeam("t1604");
    const subscription = await seedSubscription(workspaceId, { status: "past_due", pastDueSince: new Date(Date.now() - (GRACE_MS - HOUR)) });

    const graceEnd = await getPastDueGraceEnd(workspaceId);
    expect((await getEntitlements(workspaceId)).limits).toEqual(TEST_PRO_LIMITS);
    expect(graceEnd).not.toBeNull();
    const banner = renderToStaticMarkup(
      createElement(PastDueBanner, { graceEndsAt: graceEnd?.toISOString() ?? "", canManageBilling: false })
    );
    expect(banner).toContain('data-testid="billing-past-due-banner"');
    expect(banner).not.toContain('href="/billing"');

    await prisma.workspaceSubscription.update({
      where: { id: subscription.id },
      data: { past_due_since: new Date(Date.now() - (GRACE_MS + HOUR)) },
    });
    expect((await getEntitlements(workspaceId)).limits).toEqual(TEST_FREE_LIMITS);
  });

  // covers: AC-1604-3
  it("la disdetta chiede a Paddle la fine del periodo; lo stato cambia solo col webhook e il piano resta fino alla data", async () => {
    const { owner, workspaceId } = await billingTeam("t1604");
    const subscription = await seedSubscription(workspaceId, { status: "active" });
    const paddle = fakePaddleApi({ [`POST /subscriptions/${subscription.provider_subscription_id}/cancel`]: { id: subscription.provider_subscription_id } });
    const cancelAt = new Date("2026-11-01T00:00:00.000Z");

    const response = await post(cancel, "/api/billing/cancel", owner.cookie, { workspaceId });
    const before = await prisma.workspaceSubscription.findUniqueOrThrow({ where: { workspace_id: workspaceId } });
    const event = subscriptionEvent({
      eventId: "evt_cancel",
      type: "subscription.updated",
      workspaceId,
      status: "active",
      occurredAt: new Date(),
      priceId: prices.proMonth,
      subscriptionId: subscription.provider_subscription_id,
      scheduledCancelAt: cancelAt,
    });
    const body = JSON.stringify(event);
    await callRoute(webhook, { method: "POST", url: "/api/billing/webhook", body, headers: { "paddle-signature": paddleSignature(body, secret) } });

    expect(response.status).toBe(202);
    expect(paddle.requests.map((request) => [request.method, new URL(request.url).pathname, request.body])).toEqual([
      ["POST", `/subscriptions/${subscription.provider_subscription_id}/cancel`, { effective_from: "next_billing_period" }],
    ]);
    expect([before.status, before.cancel_at]).toEqual(["active", null]);
    const html = await renderBillingPage(owner.user.id, workspaceId);
    expect(html).toContain('data-testid="billing-cancel-at"');
    expect(html).toContain(formatDate(cancelAt, await getFormatter()));
    expect((await getEntitlements(workspaceId)).limits).toEqual(TEST_PRO_LIMITS);
  });

  // covers: AC-1604-4
  it("il cambio piano usa il price del nuovo piano e la proration configurata; il MEMBER vede piano e rinnovo senza azioni", async () => {
    const { owner, member, workspaceId } = await billingTeam("t1604");
    const subscription = await seedSubscription(workspaceId, { status: "active", planId: "pro" });
    const paddle = fakePaddleApi({ [`PATCH /subscriptions/${subscription.provider_subscription_id}`]: { id: subscription.provider_subscription_id } });

    const changed = await post(changePlan, "/api/billing/change-plan", owner.cookie, { workspaceId, planId: "team", interval: "month" });
    const html = await renderBillingPage(member.user.id, workspaceId);

    expect(changed.status).toBe(202);
    expect(paddle.requests).toHaveLength(1);
    expect(paddle.requests[0].method).toBe("PATCH");
    expect((paddle.requests[0].body.items as { price_id: string }[])[0].price_id).toBe(prices.teamMonth);
    expect(paddle.requests[0].body.proration_billing_mode).toBe("prorated_next_billing_period");
    expect(html).toContain("Piano: pro");
    expect(html).toContain(`Prossimo rinnovo: ${formatDate(subscription.current_period_end, await getFormatter())}`);
    expect(html).not.toContain('data-testid="billing-action"');
  });

  it("stesso piano e intervallo → 400 INVALID_PLAN; con il lancio in pausa portale e disdetta → 409 BILLING_PAUSED", async () => {
    const paddle = fakePaddleApi({});
    const { owner, workspaceId } = await billingTeam("t1604");
    await seedSubscription(workspaceId, { status: "active", planId: "pro" });

    const same = await post(changePlan, "/api/billing/change-plan", owner.cookie, { workspaceId, planId: "pro", interval: "month" });
    await setCommercialLaunchForTests("paused");
    const pausedPortal = await post(portal, "/api/billing/portal", owner.cookie, { workspaceId });
    const pausedCancel = await post(cancel, "/api/billing/cancel", owner.cookie, { workspaceId });

    expect([same.status, ((await same.json()) as { code: string }).code]).toEqual([400, "INVALID_PLAN"]);
    expect(((await pausedPortal.json()) as { code: string }).code).toBe("BILLING_PAUSED");
    expect(((await pausedCancel.json()) as { code: string }).code).toBe("BILLING_PAUSED");
    expect(paddle.requests).toHaveLength(0);
  });
});
