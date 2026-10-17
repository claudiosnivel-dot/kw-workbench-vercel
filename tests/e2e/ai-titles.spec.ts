// Gate di T-3603 (AC-3603-5): con il finto OpenRouter del global setup, il root admin accende i titoli con l'AI dalla
// card delle Impostazioni e un utente con un piano chiede la proposta per una pagina: la card resta riaprendo il
// pannello, «Usa questi titoli» porta l'H1 della proposta senza l'etichetta «suggerito» e axe non trova violazioni gravi
// sul pannello con la card aperta.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Locator, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { insertStrategy } from "../helpers/strategy";
import { createE2EUser, E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

// Utente dedicato con il piano: nulla di questo file compare nelle pagine fotografate dell'utente seed. Password
// generata a ogni esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const EMAIL = "e2e-ai-titles@example.test";
const SPOKE_TITLE = "Scarpe running donna: guida completa";
const PROPOSED_H1 = "Guida a scarpe running donna: la proposta dell'AI";
const ids = { user: "", project: "" };

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await createE2EUser(EMAIL, PASSWORD);
  const project = await prisma.project.create({
    data: { name: "Progetto titoli AI E2E", workspace_id: user.workspaceId, created_by_user_id: user.id, language_code: "it", country_code: "IT" },
  });
  await insertStrategy({
    projectId: project.id,
    pages: [
      { key: "hub", kind: "HUB", keywords: [{ text: "scarpe running", volume: 9900 }], h1: "Scarpe running: la guida pratica" },
      { key: "spoke", kind: "SPOKE", hub: "hub", keywords: [{ text: "scarpe running donna", volume: 2100 }], h1: SPOKE_TITLE },
    ],
  });
  ids.user = user.id;
  ids.project = project.id;
});

test.afterAll(async () => {
  // Il workspace personale, il progetto e il piano vanno via in cascata con l'utente; la funzione torna spenta.
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.appSetting.deleteMany({ where: { key: "AI_TITLES_SETTINGS" } });
  await prisma.$disconnect();
});

/** Pagina di un utente autenticato, senza animazioni: axe misura i colori finali. */
async function userPage(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  const login = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(login.status()).toBe(200);
  return page;
}

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).include(".plan-panel").analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

async function openSpokePanel(page: Page): Promise<Locator> {
  await page.getByTestId("plan-card").getByRole("button", { name: SPOKE_TITLE }).first().click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("titoli con l'AI", () => {
  // covers: AC-3603-5
  test("la proposta resta riaprendo il pannello e «Usa questi titoli» porta l'H1 proposto", async ({ browser }) => {
    const root = await userPage(browser, E2E_EMAIL, E2E_USER_PASSWORD);
    await root.goto("/admin/settings");
    const card = root.locator("section").filter({ has: root.getByRole("heading", { name: "Titoli con l'AI" }) });
    await expect(card).toContainText("Chiave configurata: sì");
    const toggle = card.getByRole("switch", { name: "Funzione per gli utenti" });
    if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
    await card.getByRole("button", { name: "Salva" }).click();
    await expect(card).toContainText("Salvato");

    const page = await userPage(browser, EMAIL, PASSWORD);
    await page.goto(`/projects/${ids.project}/plan?view=board`);
    let panel = await openSpokePanel(page);
    await panel.getByRole("button", { name: "Migliora i titoli con l'AI" }).click();
    await expect(panel.getByRole("region", { name: "Proposta dell'AI" })).toContainText(PROPOSED_H1);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    panel = await openSpokePanel(page);
    const proposal = panel.getByRole("region", { name: "Proposta dell'AI" });
    await expect(proposal).toContainText(PROPOSED_H1);
    await expect(proposal.getByRole("listitem")).toHaveCount(2);
    expect(await seriousViolations(page)).toEqual([]);

    await proposal.getByRole("button", { name: "Usa questi titoli" }).click();
    await expect(panel.getByRole("region", { name: "Proposta dell'AI" })).toHaveCount(0);
    await expect(panel.getByLabel("Titolo (H1)")).toHaveValue(PROPOSED_H1);
    await expect(panel.getByLabel("Titolo (H1)").locator("..")).not.toContainText("suggerito");
  });
});
