import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser } from "./credentials";

// Gate di T-5701 (AC-5701-1…3): chi non ha fatto l'accesso vede le pagine nel tema del dispositivo, chi ha una sessione
// in quello delle preferenze. Gate di T-5702 (AC-5702-1): l'interruttore sole/luna passa all'altro tema e il server lo
// ricorda dal cookie kwb_theme.

// Utente dedicato (AC-5701-3) con il tema DARK di default; password generata a ogni esecuzione, mai una credenziale reale.
const THEME_EMAIL = "e2e-public-theme@example.test";
const THEME_PASSWORD = randomBytes(18).toString("hex");

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: THEME_EMAIL } });
  await createE2EUser(THEME_EMAIL, THEME_PASSWORD);
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: THEME_EMAIL } });
  await prisma.$disconnect();
});

/** Valore calcolato di --bg-0 sull'elemento html: il fondo del tema effettivo. */
async function background(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg-0").trim());
}

test.describe("anonimo con il dispositivo sul tema chiaro", () => {
  test.use({ colorScheme: "light" });

  // covers: AC-5701-1
  test("/it e /login hanno data-theme SYSTEM e il fondo del tema chiaro", async ({ page }) => {
    for (const path of ["/it", "/login"]) {
      await page.goto(path);
      await expect(page.locator("html"), path).toHaveAttribute("data-theme", "SYSTEM");
      expect(await background(page), path).toBe("#eef3f7");
    }
  });

  // covers: AC-5701-3
  test("con una sessione e il tema DARK nelle preferenze /it resta scuro anche con il cookie kwb_theme LIGHT", async ({
    page,
    context,
  }) => {
    const login = await page.request.post("/api/auth/login", { data: { email: THEME_EMAIL, password: THEME_PASSWORD } });
    expect(login.status()).toBe(200);
    await context.addCookies([{ name: "kwb_theme", value: "LIGHT", url: "http://localhost:3100" }]);

    await page.goto("/it");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "DARK");
  });
});

test.describe("anonimo con il dispositivo sul tema scuro", () => {
  test.use({ colorScheme: "dark" });

  // covers: AC-5701-2
  test("/it ha data-theme SYSTEM e il fondo del tema scuro", async ({ page }) => {
    await page.goto("/it");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "SYSTEM");
    expect(await background(page)).toBe("#030712");
  });

  // covers: AC-5702-1
  test("«Passa al tema chiaro» porta a LIGHT, scrive il cookie e dopo il ricaricamento l'HTML arriva già LIGHT", async ({
    page,
    context,
  }) => {
    await page.goto("/it");
    await page.getByRole("button", { name: "Passa al tema chiaro" }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "LIGHT");
    expect(await background(page)).toBe("#eef3f7");
    const cookie = (await context.cookies()).find((entry) => entry.name === "kwb_theme");
    expect(cookie?.value).toBe("LIGHT");

    const response = await page.reload();
    expect(await response?.text()).toMatch(/<html[^>]*\sdata-theme="LIGHT"/);
    await expect(page.getByRole("button", { name: "Passa al tema scuro" })).toBeVisible();
  });
});
