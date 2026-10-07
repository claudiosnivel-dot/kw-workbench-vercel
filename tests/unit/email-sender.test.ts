// Gate di T-1402: email transazionali con Resend o outbox, retry idempotenti e template IT/EN (AC-1402-1…4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailSender } from "@/lib/email";
import { memoryOutbox } from "@/lib/email/outbox-sender";
import { ResendEmailSender } from "@/lib/email/resend-sender";
import { render as renderVerifyEmail } from "@/lib/email/templates/verify-email";
import { EmailDeliveryError, type EmailMessage } from "@/lib/email/types";
import { parseEnv } from "@/lib/env";

const sendMock = vi.fn();
const resendKeys: string[] = [];

// Client di Resend sostituito: registra la chiave ricevuta dal costruttore e delega emails.send al mock.
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor(apiKey: string) {
      resendKeys.push(apiKey);
    }
  },
}));

function message(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: "msg-1",
    to: "utente@example.com",
    template: "verify-email",
    locale: "it",
    subject: "Oggetto di prova",
    html: "<p>corpo</p>",
    text: "corpo",
    ...overrides,
  };
}

function failure(statusCode: number) {
  return { data: null, error: { statusCode, name: "application_error", message: "errore di prova" }, headers: null };
}

const noWait = async () => {};

beforeEach(() => {
  sendMock.mockReset();
  resendKeys.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ResendEmailSender", () => {
  // covers: AC-1402-1
  it("ritenta due volte dopo due 503 con la stessa Idempotency-Key e restituisce l'id del fornitore", async () => {
    sendMock
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce({ data: { id: "re_123" }, error: null, headers: null });
    const sender = new ResendEmailSender({ emails: { send: sendMock } }, "Seo God Mode <noreply@example.com>", noWait);

    const result = await sender.send(message({ id: "msg-1" }));

    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(sendMock.mock.calls.map(([, options]) => (options as { idempotencyKey?: string }).idempotencyKey)).toEqual([
      "msg-1",
      "msg-1",
      "msg-1",
    ]);
    expect(result).toEqual({ providerId: "re_123" });
  });

  // covers: AC-1402-2
  it("con 503 tenta 3 volte, con 422 una; lancia EmailDeliveryError e registra un solo errore senza chiave né indirizzo", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_secret");
    vi.stubEnv("EMAIL_FROM", "Seo God Mode <noreply@example.com>");

    for (const [status, expectedCalls] of [
      [503, 3],
      [422, 1],
    ] as const) {
      sendMock.mockReset();
      sendMock.mockResolvedValue(failure(status));
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      // Mittente costruito da getEmailSender (attese reali tra i tentativi): la chiave passa dal costruttore del client.
      const error = await getEmailSender().send(message({ to: "utente@example.com" })).catch((caught: unknown) => caught);

      expect(resendKeys.at(-1)).toBe("re_test_secret");
      expect(sendMock).toHaveBeenCalledTimes(expectedCalls);
      expect(error).toBeInstanceOf(EmailDeliveryError);
      expect(consoleError).toHaveBeenCalledTimes(1);
      const logged = consoleError.mock.calls[0].map(String).join(" ");
      expect(logged).toContain("example.com");
      expect(logged).not.toContain("re_test_secret");
      expect(logged).not.toContain("utente@");
      consoleError.mockRestore();
    }
  });
});

describe("template verify-email", () => {
  // covers: AC-1402-3
  it("fa l'escape delle variabili, costruisce il link da APP_PUBLIC_URL e usa il subject della lingua", () => {
    vi.stubEnv("APP_PUBLIC_URL", "https://app.example.test");
    const vars = { displayName: "<script>x</script>", token: "token-di-prova" };

    const en = renderVerifyEmail("en", vars);
    const it_ = renderVerifyEmail("it", vars);

    for (const email of [en, it_]) {
      expect(email.html).toContain("&lt;script&gt;");
      expect(email.html).not.toContain("<script>");
      expect(email.html).toContain('href="https://app.example.test/verify-email?token=token-di-prova"');
      expect(email.text).toContain("https://app.example.test/verify-email?token=token-di-prova");
    }
    expect(en.subject).toBe("Confirm your email address");
    expect(it_.subject).toBe("Conferma il tuo indirizzo email");
  });
});

describe("trasporto outbox", () => {
  // covers: AC-1402-4
  it("non usa la rete, salva il messaggio nell'outbox e in produzione la validazione rifiuta EMAIL_TRANSPORT=outbox", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "outbox");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outbox = memoryOutbox();

    await getEmailSender(outbox).send(message({ to: "destinatario@example.com", template: "password-reset" }));

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(sendMock).toHaveBeenCalledTimes(0);
    expect(outbox.messages).toHaveLength(1);
    expect(outbox.messages[0]).toMatchObject({ to: "destinatario@example.com", template: "password-reset" });

    const production = {
      NODE_ENV: "production",
      APP_SESSION_SECRET: "s".repeat(40),
      APP_ENCRYPTION_KEY: "e".repeat(40),
      JOB_SIGNING_SECRET: "j".repeat(40),
      APP_ADMIN_EMAIL: "root@example.com",
      RESEND_API_KEY: "re_test_secret",
      EMAIL_FROM: "noreply@example.com",
      APP_PUBLIC_URL: "https://app.example.com",
      EMAIL_TRANSPORT: "outbox",
    };
    expect(() => parseEnv(production)).toThrow(/EMAIL_TRANSPORT/);
    expect(() => parseEnv({ ...production, EMAIL_TRANSPORT: "resend" })).not.toThrow();
  });
});
