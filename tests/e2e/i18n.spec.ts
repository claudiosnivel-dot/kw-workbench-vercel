import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/password";

// Utente dedicato con ui_locale=en: le pagine fotografate dall'utente seed restano in italiano.
// Password generata a ogni esecuzione, mai una credenziale reale.
const USERNAME = "e2e-i18n";
const PASSWORD = randomBytes(18).toString("hex");

let userId = "";

test.beforeAll(async () => {
  const user = await prisma.user.create({
    data: { username: USERNAME, password_hash: await hashPassword(PASSWORD), ui_locale: "en" },
  });
  userId = user.id;
  await prisma.userOnboardingProgress.create({
    data: { user_id: user.id, status: "COMPLETED", current_step: "REVIEW_EXPORT", completed_at: new Date() },
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

test.describe("browser anonimo in inglese", () => {
  test.use({ locale: "en-US" });

  // covers: AC-1301-3
  test("/login segue Accept-Language e la scelta del selettore resta dopo il ricaricamento", async ({ page, context }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const switcher = page.getByRole("combobox", { name: "Language" });
    await expect(switcher).toBeVisible();

    const saved = page.waitForResponse((response) => response.url().endsWith("/api/locale") && response.status() === 200);
    await switcher.selectOption({ label: "Italiano" });
    await saved;
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("lang", "it");
    const cookie = (await context.cookies()).find((entry) => entry.name === "kwb_locale");
    expect(cookie?.value).toBe("it");
  });
});

// covers: AC-1301-4
test("la preferenza dell'utente vince sul cookie e una lingua non supportata è rifiutata", async ({ page, context, baseURL }) => {
  const login = await page.request.post("/api/auth/login", { data: { username: USERNAME, password: PASSWORD } });
  expect(login.status()).toBe(200);
  await context.addCookies([{ name: "kwb_locale", value: "it", url: baseURL as string }]);

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const rejected = await page.request.post("/api/locale", { data: { locale: "de" } });
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).code).toBe("LOCALE_UNSUPPORTED");

  const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { ui_locale: true } });
  expect(stored.ui_locale).toBe("en");
});
