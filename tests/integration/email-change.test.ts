// Gate di T-3001 (AC-3001-1…5): richiesta del cambio dell'email con il link al nuovo indirizzo, conferma monouso,
// indirizzo già usato che non si distingue, password, invio delle email e limite di frequenza, Annulla.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as cancelChange, POST as requestChange } from "@/app/api/account/email/route";
import { POST as confirmChange } from "@/app/api/auth/email-change/confirm/route";
import { resetEnvForTests } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { flushAfter } from "../helpers/next-after";

const PASSWORD = "password-3001-non-reale";
const DAY_MS = 24 * 60 * 60 * 1000;

type Body = { code?: string; data?: { newEmail?: string; expiresAt?: string } };

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createU() {
  return createUserWithSession({ displayName: "utente-u", email: "a@example.com", password: PASSWORD });
}

async function askChange(cookie: string, body: Record<string, unknown>) {
  const response = await callRoute(requestChange, { method: "POST", url: "/api/account/email", body, cookie });
  await flushAfter();
  return response;
}

async function confirm(token: string) {
  const response = await callRoute(confirmChange, { method: "POST", url: "/api/auth/email-change/confirm", body: { token } });
  await flushAfter();
  return response;
}

/** Token in chiaro dal link dell'ultima email email-change verso l'indirizzo, letta dall'outbox. */
async function tokenFromOutbox(to: string): Promise<string> {
  const email = await prisma.emailOutbox.findFirstOrThrow({
    where: { to_address: to, template: "email-change" },
    orderBy: { created_at: "desc" },
  });
  const match = /\/email-change\?token=([A-Za-z0-9_-]+)/.exec(email.text);
  expect(match).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

function storedEmail(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, email_verified_at: true } });
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("richiesta del cambio", () => {
  // covers: AC-3001-1
  it("risponde 202, salva solo lo SHA-256 del token valido 24 ore e manda il link al nuovo indirizzo", async () => {
    const { user, cookie } = await createU();

    const response = await askChange(cookie, { newEmail: "B@Example.com", currentPassword: PASSWORD });

    expect(response.status).toBe(202);
    const rows = await prisma.emailChangeToken.findMany({ where: { user_id: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].new_email).toBe("b@example.com");
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].expires_at.getTime()).toBe(rows[0].created_at.getTime() + DAY_MS);

    const outbox = await prisma.emailOutbox.findMany({ where: { to_address: "b@example.com" } });
    expect(outbox).toHaveLength(1);
    const token = await tokenFromOutbox("b@example.com");
    expect(sha256Hex(token)).toBe(rows[0].token_hash);
    expect((await storedEmail(user.id)).email).toBe("a@example.com");
  });

  // covers: AC-3001-3
  it("verso l'indirizzo di un altro utente risponde come sempre, senza token né email", async () => {
    const { cookie } = await createU();
    await createUserWithSession({ displayName: "utente-v", email: "c@example.com" });

    const taken = await askChange(cookie, { newEmail: "c@example.com", currentPassword: PASSWORD });
    const takenBody = (await taken.json()) as Body;

    expect(taken.status).toBe(202);
    expect(Object.keys(takenBody)).toEqual(["data"]);
    expect(Object.keys(takenBody.data ?? {}).sort()).toEqual(["expiresAt", "newEmail"]);
    expect(takenBody.data?.newEmail).toBe("c@example.com");
    expect(await prisma.emailChangeToken.count()).toBe(0);
    expect(await prisma.emailOutbox.count({ where: { to_address: "c@example.com" } })).toBe(0);
  });

  // covers: AC-3001-4
  it("password errata 401, invio non disponibile 503 senza righe, poi la sesta richiesta valida è 429", async () => {
    const { user, cookie } = await createU();
    const valid = { newEmail: "b@example.com", currentPassword: PASSWORD };

    const wrong = await askChange(cookie, { newEmail: "b@example.com", currentPassword: "password-sbagliata" });
    vi.stubEnv("EMAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    resetEnvForTests();
    const unavailable = await askChange(cookie, valid);

    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as Body).code).toBe("CURRENT_PASSWORD_INVALID");
    expect(unavailable.status).toBe(503);
    expect(((await unavailable.json()) as Body).code).toBe("EMAIL_UNAVAILABLE");
    expect(await prisma.emailChangeToken.count({ where: { user_id: user.id } })).toBe(0);

    vi.stubEnv("EMAIL_TRANSPORT", "outbox");
    resetEnvForTests();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await askChange(cookie, valid)).status);
    }

    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
  });
});

describe("conferma e Annulla", () => {
  // covers: AC-3001-2
  it("il token cambia l'email una volta sola, verificata, e avvisa il vecchio indirizzo; il riuso è 410", async () => {
    const { user, cookie } = await createU();
    await askChange(cookie, { newEmail: "B@Example.com", currentPassword: PASSWORD });
    const token = await tokenFromOutbox("b@example.com");

    const first = await confirm(token);
    const changed = await storedEmail(user.id);
    const notices = await prisma.emailOutbox.findMany({ where: { template: "email-changed" } });
    const second = await confirm(token);

    expect(first.status).toBe(200);
    expect(changed.email).toBe("b@example.com");
    expect(changed.email_verified_at).not.toBeNull();
    expect(notices).toHaveLength(1);
    expect(notices[0].to_address).toBe("a@example.com");
    expect(second.status).toBe(410);
    expect(((await second.json()) as Body).code).toBe("EMAIL_CHANGE_INVALID");
  });

  // covers: AC-3001-5
  it("Annulla risponde 204 e il token della richiesta non cambia più l'email", async () => {
    const { user, cookie } = await createU();
    await askChange(cookie, { newEmail: "b@example.com", currentPassword: PASSWORD });
    const token = await tokenFromOutbox("b@example.com");

    const cancel = await callRoute(cancelChange, { method: "DELETE", url: "/api/account/email", cookie });
    const confirmation = await confirm(token);

    expect(cancel.status).toBe(204);
    expect(confirmation.status).toBe(410);
    expect(((await confirmation.json()) as Body).code).toBe("EMAIL_CHANGE_INVALID");
    expect((await storedEmail(user.id)).email).toBe("a@example.com");
  });
});
