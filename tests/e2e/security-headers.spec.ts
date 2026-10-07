// Gate di T-505 (AC-505-1, AC-505-2, AC-505-3): header di sicurezza e CSP a nonce sulla build di produzione.
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createE2EUser, E2E_EMAIL, E2E_USER_PASSWORD } from "./credentials";

const ONBOARDING_EMAIL = "e2e-onboarding-csp@example.test";

function nonceOf(csp: string): string | null {
  return csp.match(/'nonce-([^']+)'/)?.[1] ?? null;
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_USER_PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

/** Registra le violazioni CSP della pagina: eventi securitypolicyviolation e messaggi della console. */
async function trackCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction("__reportCspViolation", (detail: string) => violations.push(detail));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const report = (window as unknown as { __reportCspViolation: (detail: string) => void }).__reportCspViolation;
      report(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  page.on("console", (message) => {
    if (/Content[ -]Security[ -]Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

test.describe("header di sicurezza", () => {
  // covers: AC-505-1
  // impacted-by: T-1101 (rotta /api/auth/session rimossa: la risposta API di prova è /api/health)
  test("/login e /api/health portano gli header di sicurezza e nessun X-Powered-By", async ({ request }) => {
    for (const path of ["/login", "/api/health"]) {
      const response = await request.get(path);
      const headers = response.headers();

      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["x-powered-by"]).toBeUndefined();
    }
  });

  // covers: AC-505-2
  test("ogni risposta di /login ha una CSP con un nonce nuovo applicato a ogni script dell'HTML", async ({ request }) => {
    const nonces: string[] = [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request.get("/login");
      const csp = response.headers()["content-security-policy"] ?? "";
      const nonce = nonceOf(csp);
      const html = await response.text();
      const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];

      expect(csp).toContain("frame-ancestors 'none'");
      expect(nonce).not.toBeNull();
      expect(scriptTags.length).toBeGreaterThan(0);
      for (const tag of scriptTags) {
        expect(tag.match(/\snonce="([^"]*)"/)?.[1]).toBe(nonce);
      }
      nonces.push(nonce as string);
    }

    expect(nonces[0]).not.toBe(nonces[1]);
  });

  // covers: AC-505-3
  test("login, dashboard, risultati e onboarding non registrano violazioni CSP", async ({ browser }) => {
    const project = await prisma.project.findFirstOrThrow({
      where: { name: "Progetto E2E", owner: { email: E2E_EMAIL } },
      select: { id: true },
    });
    await prisma.user.deleteMany({ where: { email: ONBOARDING_EMAIL } });
    await createE2EUser(ONBOARDING_EMAIL, E2E_USER_PASSWORD);

    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    const userViolations = await trackCspViolations(userPage);
    await userPage.goto("/login");
    await expect(userPage.getByRole("button", { name: "Accedi" })).toBeVisible();
    await login(userPage, E2E_EMAIL);
    await userPage.goto("/");
    await expect(userPage.getByRole("button", { name: "Esci" }).first()).toBeVisible();
    await userPage.goto(`/projects/${project.id}/results`);
    await expect(userPage.getByRole("button", { name: "Esci" }).first()).toBeVisible();

    const onboardingContext = await browser.newContext();
    const onboardingPage = await onboardingContext.newPage();
    const onboardingViolations = await trackCspViolations(onboardingPage);
    await login(onboardingPage, ONBOARDING_EMAIL);
    await onboardingPage.goto("/onboarding/welcome");
    await expect(onboardingPage.getByText("Percorso guidato", { exact: true })).toBeVisible();

    expect([...userViolations, ...onboardingViolations]).toEqual([]);
    await userContext.close();
    await onboardingContext.close();
  });
});
