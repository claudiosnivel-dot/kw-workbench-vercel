// Gate di T-2801 (AC-2801-2, AC-2801-3) e T-2802 (AC-2802-4): area «Il tuo account» con la navigazione a sezioni, le card
// di oggi al posto giusto, nome senza password e password nella sezione Accesso; il cambio password obbligato resta
// fuori dalla navigazione.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Utenti dedicati: le pagine fotografate dall'utente seed non cambiano. Password generata a ogni esecuzione, mai una
// credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const EMAIL = "e2e-account@example.test";
const PENDING_EMAIL = "e2e-account-pending@example.test";

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, PENDING_EMAIL] } } });
  await createE2EUser(EMAIL, PASSWORD);
  await createE2EUser(PENDING_EMAIL, PASSWORD, { must_change_password: true });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, PENDING_EMAIL] } } });
  await prisma.$disconnect();
});

async function login(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(response.status()).toBe(200);
}

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

function sectionNav(page: Page) {
  return page.getByRole("navigation", { name: "Menu del tuo account" });
}

test.describe("area Il tuo account", () => {
  // covers: AC-2801-2
  test("Preferenze, Collegamenti e I tuoi dati hanno titolo, navigazione con la voce corrente e la card di oggi", async ({ page }) => {
    await login(page, EMAIL);
    const sections = [
      { path: "/account/preferences", item: "Preferenze", card: "Accessibilità e tema" },
      { path: "/account/connections", item: "Collegamenti", card: "Google Sheets personale" },
      { path: "/account/data", item: "I tuoi dati", card: "Scarica i tuoi dati" },
    ];

    for (const section of sections) {
      const response = await page.goto(section.path);
      expect(response?.status(), section.path).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "Il tuo account" })).toBeVisible();
      await expect(sectionNav(page).getByRole("link", { name: section.item })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { name: section.card })).toBeVisible();
      expect(await seriousViolations(page), section.path).toEqual([]);
    }
  });

  // covers: AC-2801-3
  test("il cambio password obbligato risponde 200 senza la navigazione delle sezioni", async ({ page }) => {
    await login(page, PENDING_EMAIL);

    const response = await page.goto("/account/password");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(sectionNav(page)).toHaveCount(0);
  });

  // covers: AC-2802-4
  test("Personalizza porta alle Preferenze, il Profilo non chiede password e l'Accesso ha la password e l'uscita ovunque", async ({ page }) => {
    await login(page, EMAIL);

    await page.goto("/personalizza");
    await expect(page).toHaveURL((url) => url.pathname === "/account/preferences");

    await page.goto("/account");
    await expect(page.getByLabel("Nome mostrato")).toBeVisible();
    await expect(page.getByText(EMAIL)).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    await page.goto("/account/security");
    await expect(page.locator('input[type="password"]')).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Esci da tutti i dispositivi" })).toBeVisible();
  });
});
