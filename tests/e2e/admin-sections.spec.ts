// Gate di T-3301 (AC-3301-1…3): Amministrazione a sezioni con la navigazione comune; il root admin vede Panoramica,
// Utenti, Impostazioni e Registro, l'admin non root solo Utenti, gli altri utenti tornano alla home.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser, E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

// Il root admin è l'utente seed (ce n'è uno solo); admin non root e sottoscrittore sono dedicati. Password generata a ogni
// esecuzione, mai una credenziale reale.
const PASSWORD = randomBytes(18).toString("hex");
const ADMIN_EMAIL = "e2e-admin-sections-admin@example.test";
const SUBSCRIBER_EMAIL = "e2e-admin-sections-sub@example.test";
const EMAILS = [ADMIN_EMAIL, SUBSCRIBER_EMAIL];

test.beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await createE2EUser(ADMIN_EMAIL, PASSWORD, { role: "ADMIN" });
  await createE2EUser(SUBSCRIBER_EMAIL, PASSWORD);
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  await prisma.$disconnect();
});

/** Pagina di un utente autenticato, senza animazioni: axe misura i colori finali, non l'ingresso delle card. */
async function userPage(browser: Browser, email: string, password = PASSWORD): Promise<Page> {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  const login = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(login.status()).toBe(200);
  return page;
}

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

function sectionNav(page: Page) {
  return page.getByRole("navigation", { name: "Menu dell'amministrazione" });
}

test.describe("area Amministrazione", () => {
  // covers: AC-3301-1
  test("il root admin apre le quattro sezioni con la voce corrente e senza violazioni axe gravi", async ({ browser }) => {
    const root = await userPage(browser, E2E_EMAIL, E2E_USER_PASSWORD);
    const sections = [
      { path: "/admin", item: "Panoramica" },
      { path: "/admin/users", item: "Utenti" },
      { path: "/admin/settings", item: "Impostazioni" },
      { path: "/admin/log", item: "Registro" },
    ];

    for (const section of sections) {
      const response = await root.goto(section.path);
      expect(response?.status(), section.path).toBe(200);
      await expect(sectionNav(root).getByRole("link")).toHaveCount(4);
      await expect(sectionNav(root).getByRole("link", { name: section.item })).toHaveAttribute("aria-current", "page");
      if (section.path === "/admin/settings") {
        await expect(root.getByRole("heading", { name: "Lancio commerciale" })).toBeVisible();
        await expect(root.getByLabel("Nome applicazione")).toBeVisible();
      }
      expect(await seriousViolations(root), section.path).toEqual([]);
    }
  });

  // covers: AC-3301-2
  test("l'admin non root arriva sempre a Utenti, con una sola voce e senza il branding", async ({ browser }) => {
    const admin = await userPage(browser, ADMIN_EMAIL);

    for (const path of ["/admin", "/admin/settings", "/admin/log"]) {
      await admin.goto(path);
      await expect(admin, path).toHaveURL(/\/admin\/users$/);
      await expect(sectionNav(admin).getByRole("link")).toHaveCount(1);
      await expect(sectionNav(admin).getByRole("link", { name: "Utenti" })).toHaveAttribute("aria-current", "page");
      await expect(admin.getByLabel("Nome applicazione")).toHaveCount(0);
    }
  });

  // covers: AC-3301-3
  test("un sottoscrittore che apre /admin/users torna alla home", async ({ browser }) => {
    const subscriber = await userPage(browser, SUBSCRIBER_EMAIL);

    await subscriber.goto("/admin/users");

    expect(new URL(subscriber.url()).pathname).toBe("/");
    await expect(sectionNav(subscriber)).toHaveCount(0);
  });
});
