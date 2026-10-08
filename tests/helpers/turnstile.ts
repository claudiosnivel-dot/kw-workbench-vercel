import { randomBytes } from "node:crypto";
import { vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";

/** Token fittizio documentato da Cloudflare: nei test siteverify è sempre simulato, nessuna chiamata di rete (T-1702). */
export const TEST_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEFAULT_PUBLIC_URL = "https://app.example.test";

/** Host di APP_PUBLIC_URL al momento della risposta: quello che verifyTurnstile si aspetta. */
function testAppHost(): string {
  return new URL(process.env.APP_PUBLIC_URL ?? DEFAULT_PUBLIC_URL).hostname;
}

/** Risposta di siteverify riuscita per l'host di APP_PUBLIC_URL e l'action indicata. */
export function siteverifySuccess(action: "register" | "password-reset" = "register"): Response {
  return Response.json({ success: true, hostname: testAppHost(), action, "error-codes": [] });
}

/**
 * Turnstile configurato con chiavi casuali non di test (generate a ogni esecuzione: mai chiavi reali) e, se manca,
 * APP_PUBLIC_URL su un host di prova; fetch verso siteverify passa dal mock restituito, che di default risponde success
 * per l'action indicata, mentre le altre richieste vanno al fetch originale. Per i test di registrazione e recupero
 * password con il CAPTCHA obbligatorio (T-1702).
 */
export function configureTestTurnstile(action: "register" | "password-reset" = "register") {
  const secretKey = `0x4AAAA${randomBytes(12).toString("hex")}`;
  vi.stubEnv("TURNSTILE_SECRET_KEY", secretKey);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", `0x4AAAA${randomBytes(8).toString("hex")}`);
  if (!process.env.APP_PUBLIC_URL) {
    vi.stubEnv("APP_PUBLIC_URL", DEFAULT_PUBLIC_URL);
  }
  resetEnvForTests();

  const siteverify = vi.fn(async (_form: URLSearchParams): Promise<Response> => siteverifySuccess(action));
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === SITEVERIFY_URL) {
      return siteverify(new URLSearchParams(String(init?.body ?? "")));
    }
    return originalFetch(input, init);
  });
  return { secretKey, siteverify };
}
