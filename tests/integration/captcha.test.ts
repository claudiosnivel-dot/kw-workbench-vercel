// Gate di T-1702 (AC-1702-1…4): CAPTCHA Cloudflare Turnstile verificato lato server su registrazione e richiesta di
// reset, siteverify sempre simulato (nessuna chiamata di rete), chiavi di test rifiutate in produzione.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { POST as register } from "@/app/api/auth/register/route";
import { parseEnv, resetEnvForTests } from "@/lib/env";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { flushAfter } from "../helpers/next-after";
import { configureTestTurnstile, siteverifySuccess } from "../helpers/turnstile";

const PASSWORD = "password-1702-non-reale";

type ErrorBody = { code?: string };

function registration(email: string, turnstileToken?: string) {
  return callRoute(register, {
    method: "POST",
    url: "/api/auth/register",
    headers: { "x-forwarded-for": "203.0.113.9" },
    body: { email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true, termsVersion: LEGAL_TERMS_VERSION, turnstileToken },
  });
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  vi.stubEnv("VERCEL", "1");
  resetEnvForTests();
  await resetDatabase();
  // Un utente esiste già: la registrazione non esegue il bootstrap del root admin.
  await createUserWithSession({ email: "esistente@example.com", displayName: "esistente" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

describe("registrazione", () => {
  // covers: AC-1702-1
  it("senza token risponde 400 CAPTCHA_REQUIRED senza nuovi utenti né chiamate a siteverify", async () => {
    await setCommercialLaunchForTests("live");
    const { siteverify } = configureTestTurnstile();
    const usersBefore = await prisma.user.count();

    const response = await registration("senza-token@example.com");

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).code).toBe("CAPTCHA_REQUIRED");
    expect(await prisma.user.count()).toBe(usersBefore);
    expect(siteverify).toHaveBeenCalledTimes(0);
  });

  // covers: AC-1702-2
  it("token rifiutato o per un altro host: 400 CAPTCHA_INVALID; token valido: 202 e un utente; secret e remoteip inviati", async () => {
    await setCommercialLaunchForTests("live");
    const { secretKey, siteverify } = configureTestTurnstile();
    siteverify
      .mockResolvedValueOnce(Response.json({ success: false, "error-codes": ["invalid-input-response"] }))
      .mockResolvedValueOnce(Response.json({ success: true, hostname: "evil.example", action: "register" }))
      .mockImplementationOnce(async () => siteverifySuccess("register"));

    const rejected = await registration("primo@example.com", "token-uno");
    const otherHost = await registration("secondo@example.com", "token-due");
    const accepted = await registration("terzo@example.com", "token-tre");

    for (const response of [rejected, otherHost]) {
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).code).toBe("CAPTCHA_INVALID");
    }
    expect(await prisma.user.count({ where: { email: { in: ["primo@example.com", "secondo@example.com"] } } })).toBe(0);
    expect(accepted.status).toBe(202);
    expect(await prisma.user.count({ where: { email: "terzo@example.com" } })).toBe(1);
    expect(siteverify).toHaveBeenCalledTimes(3);
    for (const [form] of siteverify.mock.calls) {
      expect(form.get("secret")).toBe(secretKey);
      expect(form.get("remoteip")).toBe("203.0.113.9");
    }
  });
});

describe("richiesta di reset password", () => {
  // covers: AC-1702-3
  it("senza token 400 CAPTCHA_REQUIRED, con siteverify in timeout 503 CAPTCHA_UNAVAILABLE e nessuna email", async () => {
    const { siteverify } = configureTestTurnstile("password-reset");
    siteverify.mockRejectedValueOnce(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    const reset = (turnstileToken?: string) =>
      callRoute(requestReset, {
        method: "POST",
        url: "/api/auth/password-reset/request",
        body: { email: "esistente@example.com", turnstileToken },
      });

    const missing = await reset();
    const timedOut = await reset("token-in-timeout");
    await flushAfter();

    expect([missing.status, ((await missing.json()) as ErrorBody).code]).toEqual([400, "CAPTCHA_REQUIRED"]);
    expect([timedOut.status, ((await timedOut.json()) as ErrorBody).code]).toEqual([503, "CAPTCHA_UNAVAILABLE"]);
    expect(await prisma.emailOutbox.count()).toBe(0);
  });
});

describe("chiavi in produzione", () => {
  // Configurazione di produzione valida, con valori fittizi generati qui (mai valori reali).
  const secret = "x".repeat(40);
  const production = {
    NODE_ENV: "production",
    APP_SESSION_SECRET: secret,
    APP_ENCRYPTION_KEY: secret,
    JOB_SIGNING_SECRET: "y".repeat(40),
    APP_ADMIN_EMAIL: "root@example.com",
    EMAIL_TRANSPORT: "resend",
    APP_PUBLIC_URL: "https://app.example.com",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: `0x4AAAA${"b".repeat(16)}`,
  };

  // covers: AC-1702-4
  it("con la secret di test di Cloudflare la validazione fallisce nominando TURNSTILE_SECRET_KEY", () => {
    const testSecret = `1x${"0".repeat(31)}AA`;
    expect(() => parseEnv({ ...production, TURNSTILE_SECRET_KEY: `0x4AAAA${"c".repeat(16)}` })).not.toThrow();

    let message = "";
    try {
      parseEnv({ ...production, TURNSTILE_SECRET_KEY: testSecret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/TURNSTILE_SECRET_KEY/);
    expect(message).not.toContain(testSecret);
  });
});
