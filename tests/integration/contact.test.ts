// Gate di T-1805 (AC-1805-1…4): modulo contatti pubblico con rate limit e CAPTCHA, email al supporto con Reply-To del
// mittente, nessuna iniezione negli header. siteverify sempre simulato, email nell'outbox di test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as contact } from "@/app/api/contact/route";
import { resetEnvForTests } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { configureTestTurnstile, TEST_TURNSTILE_TOKEN } from "../helpers/turnstile";

const SUPPORT = "support@example.test";
const MESSAGE = "Vorrei sapere come esportare le keyword in Google Sheets.";

function validBody(overrides: Record<string, unknown> = {}) {
  return { name: "Mario Rossi", email: "mario@example.com", category: "support", message: MESSAGE, turnstileToken: TEST_TURNSTILE_TOKEN, ...overrides };
}

function send(body: unknown, options: { ip?: string; cookie?: string } = {}) {
  return callRoute(contact, {
    method: "POST",
    url: "/api/contact",
    headers: { "x-forwarded-for": options.ip ?? "203.0.113.10" },
    body,
    cookie: options.cookie,
  });
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  vi.stubEnv("SUPPORT_EMAIL", SUPPORT);
  vi.stubEnv("VERCEL", "1");
  resetEnvForTests();
  await resetDatabase();
  configureTestTurnstile("contact");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

describe("modulo contatti", () => {
  // covers: AC-1805-1
  it("un invio valido risponde 202 e l'outbox ha 1 email al supporto con Reply-To del mittente e il messaggio", async () => {
    const response = await send(validBody());

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    const emails = await prisma.emailOutbox.findMany();
    expect(emails).toHaveLength(1);
    expect(emails[0].to_address).toBe(SUPPORT);
    expect(emails[0].reply_to).toBe("mario@example.com");
    expect(emails[0].template).toBe("contact-message");
    expect(emails[0].text).toContain(MESSAGE);
    expect(emails[0].html).toContain(MESSAGE);
    expect(emails[0].subject).toBe("Modulo contatti: Supporto");
  });

  // covers: AC-1805-2
  it("un'email con CRLF e Bcc e un messaggio di 5001 caratteri ricevono 400 VALIDATION_ERROR senza email", async () => {
    const crlf = await send(validBody({ email: "a@example.com\r\nBcc: x@evil.test" }));
    expect(crlf.status).toBe(400);
    expect((await crlf.json()).code).toBe("VALIDATION_ERROR");

    const long = await send(validBody({ message: "a".repeat(5001) }));
    expect(long.status).toBe(400);
    expect((await long.json()).code).toBe("VALIDATION_ERROR");

    expect(await prisma.emailOutbox.count()).toBe(0);
  });

  // covers: AC-1805-3
  it("oltre la soglia per IP 429 con Retry-After; senza token da un altro IP 400 CAPTCHA_REQUIRED", async () => {
    vi.stubEnv("RATE_LIMIT_CONTACT_IP_MAX", "2");
    resetEnvForTests();

    expect((await send(validBody())).status).toBe(202);
    expect((await send(validBody())).status).toBe(202);
    const third = await send(validBody());
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);

    const noToken = await send(validBody({ turnstileToken: undefined }), { ip: "198.51.100.20" });
    expect(noToken.status).toBe(400);
    expect((await noToken.json()).code).toBe("CAPTCHA_REQUIRED");

    expect(await prisma.emailOutbox.count()).toBe(2);
  });

  // covers: AC-1805-4
  it("con un mittente autenticato l'email riporta l'id dell'utente e del workspace corrente", async () => {
    const user = await createUserWithSession({ displayName: "t1805-user" });

    const response = await send(validBody({ email: "t1805-user@example.test" }), { cookie: user.cookie });

    expect(response.status).toBe(202);
    const email = await prisma.emailOutbox.findFirstOrThrow();
    expect(email.text).toContain(user.user.id);
    expect(email.text).toContain(user.workspaceId);
    expect(email.html).toContain(user.workspaceId);
  });

  it("i campi dell'utente arrivano con escape nell'HTML e senza SUPPORT_EMAIL il destinatario è APP_ADMIN_EMAIL", async () => {
    vi.stubEnv("SUPPORT_EMAIL", "");
    vi.stubEnv("APP_ADMIN_EMAIL", "root-admin@example.test");
    resetEnvForTests();

    const response = await send(validBody({ name: "<b>Mario</b>", message: "<script>alert(1)</script> messaggio" }));

    expect(response.status).toBe(202);
    const email = await prisma.emailOutbox.findFirstOrThrow();
    expect(email.to_address).toBe("root-admin@example.test");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;b&gt;Mario&lt;/b&gt;");
  });

  it("senza indirizzo di supporto né APP_ADMIN_EMAIL risponde 503 CONTACT_UNAVAILABLE", async () => {
    vi.stubEnv("SUPPORT_EMAIL", "");
    vi.stubEnv("APP_ADMIN_EMAIL", "");
    resetEnvForTests();

    const response = await send(validBody());

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("CONTACT_UNAVAILABLE");
    expect(await prisma.emailOutbox.count()).toBe(0);
  });
});
