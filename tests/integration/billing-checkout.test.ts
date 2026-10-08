// Gate di T-1602 (AC-1602-1…4): checkout per workspace avviato solo dall'OWNER, transazione creata lato server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as checkout } from "@/app/api/billing/checkout/route";
import { getBillingProvider } from "@/lib/billing/paddle";
import { setPlansForTesting } from "@/lib/billing/plans";
import { parseEnv, resetEnvForTests } from "@/lib/env";
import { billingTeam, seedSubscription } from "../helpers/billing-team";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { configureTestBilling, fakePaddleValue } from "../helpers/paddle";
import { fakePaddleApi } from "../helpers/paddle-fake";

let prices: ReturnType<typeof configureTestBilling>["prices"];

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  ({ prices } = configureTestBilling());
  await resetDatabase();
  await setCommercialLaunchForTests("live");
});

afterEach(() => {
  setPlansForTesting(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

const startCheckout = (cookie: string, body: Record<string, unknown>) =>
  callRoute(checkout, { method: "POST", url: "/api/billing/checkout", body, cookie });

const codeOf = async (response: Response) => [response.status, ((await response.json()) as { code: string }).code];

describe("checkout del workspace", () => {
  // covers: AC-1602-1
  it("l'OWNER ottiene l'id della transazione creata con il price del piano e il workspace scritto dal server", async () => {
    const paddle = fakePaddleApi({ "POST /transactions": { id: "txn_01test" } });
    const { owner, workspaceId } = await billingTeam("t1602");

    const response = await startCheckout(owner.cookie, {
      workspaceId,
      planId: "pro",
      interval: "month",
      custom_data: { workspace_id: "altro" },
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: { transactionId: string } }).data.transactionId).toBe("txn_01test");
    expect(paddle.requests).toHaveLength(1);
    const [request] = paddle.requests;
    expect([request.method, new URL(request.url).pathname]).toEqual(["POST", "/transactions"]);
    expect(request.authorization).toBe(`Bearer ${process.env.PADDLE_API_KEY}`);
    expect((request.body.items as { price_id: string }[])[0].price_id).toBe(prices.proMonth);
    expect(request.body.custom_data).toEqual({ workspace_id: workspaceId, initiated_by_user_id: owner.user.id });
  });

  // covers: AC-1602-2
  it("ADMIN e MEMBER ricevono 403, un non membro 404, e Paddle non riceve richieste", async () => {
    const paddle = fakePaddleApi({ "POST /transactions": { id: "txn_01test" } });
    const { admin, member, outsider, workspaceId } = await billingTeam("t1602");
    const body = { workspaceId, planId: "pro", interval: "month" };

    expect(await codeOf(await startCheckout(admin.cookie, body))).toEqual([403, "FORBIDDEN"]);
    expect(await codeOf(await startCheckout(member.cookie, body))).toEqual([403, "FORBIDDEN"]);
    expect(await codeOf(await startCheckout(outsider.cookie, body))).toEqual([404, "WORKSPACE_NOT_FOUND"]);
    expect(paddle.requests).toHaveLength(0);
  });

  // covers: AC-1602-3
  it("piano free o inesistente → 400 INVALID_PLAN; workspace già abbonato → 409 SUBSCRIPTION_EXISTS", async () => {
    const paddle = fakePaddleApi({ "POST /transactions": { id: "txn_01test" } });
    const { owner, workspaceId } = await billingTeam("t1602");

    const free = await startCheckout(owner.cookie, { workspaceId, planId: "free", interval: "month" });
    const missing = await startCheckout(owner.cookie, { workspaceId, planId: "inesistente", interval: "month" });
    await seedSubscription(workspaceId, { status: "active" });
    const existing = await startCheckout(owner.cookie, { workspaceId, planId: "pro", interval: "month" });

    expect(await codeOf(free)).toEqual([400, "INVALID_PLAN"]);
    expect(await codeOf(missing)).toEqual([400, "INVALID_PLAN"]);
    expect(await codeOf(existing)).toEqual([409, "SUBSCRIPTION_EXISTS"]);
    expect(paddle.requests).toHaveLength(0);
  });

  // covers: AC-1602-4
  it("con PADDLE_ENV=sandbox la transazione va all'API sandbox; una chiave sandbox in production non supera la validazione", async () => {
    vi.stubEnv("PADDLE_API_BASE_URL", "");
    const paddle = fakePaddleApi({ "POST /transactions": { id: "txn_01test" } });

    await getBillingProvider("req-test").createCheckout({
      priceId: prices.proMonth,
      workspaceId: "ws-test",
      initiatedByUserId: "user-test",
      customerId: null,
    });
    const sandboxKey = fakePaddleValue("pdl_sdbx_apikey_");
    const validationError = (() => {
      try {
        parseEnv({ PADDLE_ENV: "production", PADDLE_API_KEY: sandboxKey });
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();

    expect(paddle.requests[0].url).toBe("https://sandbox-api.paddle.com/transactions");
    expect(validationError).toContain("PADDLE_API_KEY");
    expect(validationError).not.toContain(sandboxKey);
  });

  it("con il lancio in pausa l'OWNER riceve 409 BILLING_PAUSED; un errore di Paddle è un 502 senza il body", async () => {
    const paddle = fakePaddleApi({});
    const { owner, workspaceId } = await billingTeam("t1602");
    const body = { workspaceId, planId: "pro", interval: "month" };

    const failed = await startCheckout(owner.cookie, body);
    await setCommercialLaunchForTests("paused");
    const paused = await startCheckout(owner.cookie, body);

    expect(await codeOf(failed)).toEqual([502, "BILLING_PROVIDER_ERROR"]);
    expect(await codeOf(paused)).toEqual([409, "BILLING_PAUSED"]);
    expect(paddle.requests).toHaveLength(1);
  });
});
