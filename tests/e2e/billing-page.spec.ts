// Gate di T-1604 nel browser (AC-1604-2…4): banner del pagamento scaduto sulla dashboard, data di fine dopo il
// webhook di disdetta e pagina /billing del MEMBER senza azioni. Paddle non viene chiamato: le chiamate all'API sono
// coperte da tests/integration/billing-portal.test.ts, qui gli stati arrivano dal DB e da un webhook firmato.
import { createHmac, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { createE2EUser, E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

// Utenti dedicati: il workspace con l'abbonamento non compare nelle pagine fotografate dall'utente seed.
const PASSWORD = randomBytes(18).toString("hex");
const OWNER_EMAIL = "e2e-billing-owner@example.test";
const MEMBER_EMAIL = "e2e-billing-member@example.test";
const PERIOD_END = new Date("2026-11-01T00:00:00.000Z");
const CANCEL_AT = new Date("2026-12-15T00:00:00.000Z");

const ids = { workspace: "", users: [] as string[] };

async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  const response = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(response.status()).toBe(200);
}

/**
 * Stato del lancio commerciale (T-1606). paused passa dalla rotta del root admin, che invalida la cache del server;
 * live (che richiede la checklist, qui incompleta) si scrive nel DB subito dopo, a cache vuota. La chiave di cifratura
 * è quella del server (E2E_APP_ENCRYPTION_KEY di playwright.config.ts).
 */
async function setLaunch(page: Page, status: "live" | "paused"): Promise<void> {
  await login(page, E2E_EMAIL, E2E_USER_PASSWORD);
  const paused = await page.request.patch("/api/admin/launch", { data: { status: "paused" } });
  expect(paused.status()).toBe(200);
  if (status === "live") {
    process.env.APP_ENCRYPTION_KEY = process.env.E2E_APP_ENCRYPTION_KEY;
    await upsertSettingValue({ key: "COMMERCIAL_LAUNCH_STATUS", value: JSON.stringify({ status: "live", changedAt: null, changedBy: null }) });
  }
  await page.context().clearCookies();
}

async function seedSubscription(data: { status: "active" | "past_due"; pastDueSince?: Date }) {
  await prisma.workspaceSubscription.deleteMany({ where: { workspace_id: ids.workspace } });
  await prisma.workspaceSubscription.create({
    data: {
      workspace_id: ids.workspace,
      provider: "paddle",
      provider_subscription_id: "sub_e2e_billing",
      provider_customer_id: "ctm_e2e_billing",
      plan_id: "pro",
      status: data.status,
      current_period_start: new Date("2026-10-01T00:00:00.000Z"),
      current_period_end: PERIOD_END,
      past_due_since: data.pastDueSince ?? null,
      billing_interval: "month",
      billing_frequency: 1,
      last_event_occurred_at: new Date(Date.now() - 3_600_000),
    },
  });
}

test.beforeAll(async ({ browser }) => {
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, MEMBER_EMAIL] } } });
  const [owner, member] = await Promise.all([OWNER_EMAIL, MEMBER_EMAIL].map((email) => createE2EUser(email, PASSWORD)));
  ids.users = [owner.id, member.id];
  ids.workspace = owner.workspaceId;
  await prisma.userOnboardingProgress.createMany({
    data: ids.users.map((userId) => ({ user_id: userId, status: "COMPLETED", current_step: "REVIEW_EXPORT", completed_at: new Date() })),
  });
  // Il MEMBER lavora nel workspace dell'OWNER, che resta il suo workspace attivo (unico oltre al personale).
  await prisma.membership.create({ data: { workspace_id: owner.workspaceId, user_id: member.id, role: "MEMBER" } });
  const page = await browser.newPage();
  await setLaunch(page, "live");
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await setLaunch(page, "paused");
  await page.close();
  // Workspace personali, membership e abbonamento vanno via in cascata con gli utenti.
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.$disconnect();
});

async function memberPage(page: Page): Promise<void> {
  await login(page, MEMBER_EMAIL);
  const active = await page.request.post("/api/workspaces/active", { data: { workspaceId: ids.workspace } });
  expect(active.status()).toBe(204);
}

test.describe("fatturazione del workspace", () => {
  // covers: AC-1604-2
  test("con il pagamento scaduto la dashboard del membro mostra il banner senza il link al pagamento", async ({ page }) => {
    await seedSubscription({ status: "past_due", pastDueSince: new Date(Date.now() - 3_600_000) });
    await memberPage(page);

    await page.goto("/");

    const banner = page.getByTestId("billing-past-due-banner");
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("link")).toHaveCount(0);
  });

  // covers: AC-1604-4
  test("il MEMBER vede piano e rinnovo e nessuna azione di fatturazione", async ({ page }) => {
    await seedSubscription({ status: "active" });
    await memberPage(page);

    await page.goto("/billing");

    const summary = page.getByTestId("billing-summary");
    await expect(summary).toContainText("Piano: pro");
    await expect(summary).toContainText("Prossimo rinnovo: 01/11/26");
    await expect(page.getByTestId("billing-action")).toHaveCount(0);
  });

  // covers: AC-1604-3
  test("dopo il webhook di disdetta programmata /billing mostra la data di fine", async ({ page }) => {
    await seedSubscription({ status: "active" });
    const body = JSON.stringify({
      event_id: `evt_e2e_${randomBytes(6).toString("hex")}`,
      event_type: "subscription.updated",
      occurred_at: new Date().toISOString(),
      notification_id: "ntf_e2e",
      data: {
        id: "sub_e2e_billing",
        status: "active",
        customer_id: "ctm_e2e_billing",
        currency_code: "EUR",
        custom_data: { workspace_id: ids.workspace },
        current_billing_period: { starts_at: "2026-10-01T00:00:00.000Z", ends_at: PERIOD_END.toISOString() },
        scheduled_change: { action: "cancel", effective_at: CANCEL_AT.toISOString(), resume_at: null },
        billing_cycle: { interval: "month", frequency: 1 },
        items: [{ quantity: 1, price: { id: "pri_e2e", unit_price: { amount: "1900" } } }],
      },
    });
    const ts = Math.floor(Date.now() / 1000);
    const h1 = createHmac("sha256", process.env.E2E_PADDLE_WEBHOOK_SECRET ?? "").update(`${ts}:${body}`).digest("hex");

    const delivered = await page.request.post("/api/billing/webhook", {
      data: body,
      headers: { "content-type": "application/json", "paddle-signature": `ts=${ts};h1=${h1}` },
    });
    expect(delivered.status()).toBe(200);
    await memberPage(page);
    await page.goto("/billing");

    await expect(page.getByTestId("billing-cancel-at")).toContainText("15/12/26");
  });
});
