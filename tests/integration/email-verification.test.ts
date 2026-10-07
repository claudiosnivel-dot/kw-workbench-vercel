// Gate di T-1403: verifica dell'email alla registrazione (AC-1403-1…5).
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as resendVerification } from "@/app/api/auth/verify-email/resend/route";
import { POST as runProject } from "@/app/api/projects/[id]/run/route";
import { GET as getPreferences } from "@/app/api/user/preferences/route";
import { issueVerificationToken } from "@/lib/auth/email-verification";
import { resetEnvForTests } from "@/lib/env";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { flushAfter } from "../helpers/next-after";

const PASSWORD = "password-1403-non-reale";
const T0 = new Date("2026-10-07T10:00:00.000Z");

function registration(email: string) {
  return {
    method: "POST",
    url: "/api/auth/register",
    body: { email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true, termsVersion: LEGAL_TERMS_VERSION },
  };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Token in chiaro dal link dell'ultima email di verifica per l'indirizzo, letta dall'outbox. */
async function tokenFromOutbox(to: string): Promise<string> {
  const email = await prisma.emailOutbox.findFirstOrThrow({
    where: { to_address: to, template: "verify-email" },
    orderBy: { created_at: "desc" },
  });
  const match = /\/verify-email\?token=([A-Za-z0-9_-]+)/.exec(email.text);
  expect(match).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

function verifyRequest(token: string) {
  return { method: "POST", url: "/api/auth/verify-email", body: { token } };
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
  vi.stubEnv("APP_ADMIN_EMAIL", "root@example.test");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetEnvForTests();
});

describe("registrazione con email nuova", () => {
  // covers: AC-1403-1
  it("invia verify-email e nel DB salva solo lo SHA-256 del token", async () => {
    expect(await prisma.emailOutbox.count()).toBe(0);

    const response = await callRoute(register, registration("nuovo@example.com"));
    await flushAfter();

    expect(response.status).toBe(202);
    const messages = await prisma.emailOutbox.findMany();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ to_address: "nuovo@example.com", template: "verify-email" });

    const token = await tokenFromOutbox("nuovo@example.com");
    const rows = await prisma.emailVerificationToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows.some((row) => row.token_hash === token)).toBe(false);
    expect(rows[0].token_hash).toBe(sha256Hex(token));
  });
});

describe("conferma del token", () => {
  // covers: AC-1403-2
  it("il token valido verifica una volta sola; riuso e token scaduto rispondono 400 con corpo identico", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const { user } = await createUserWithSession({ displayName: "t1403-verifica", emailVerified: false });
    await issueVerificationToken(user.id);
    const valid = await tokenFromOutbox("t1403-verifica@example.test");
    const expired = "token-scaduto-di-prova";
    const expiredCreatedAt = new Date(T0.getTime() - (24 * 60 * 60 + 1) * 1000);
    await prisma.emailVerificationToken.create({
      data: {
        user_id: user.id,
        token_hash: sha256Hex(expired),
        created_at: expiredCreatedAt,
        expires_at: new Date(expiredCreatedAt.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    const first = await callRoute(verifyEmail, verifyRequest(valid));
    const verifiedAt = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email_verified_at;
    const reused = await callRoute(verifyEmail, verifyRequest(valid));
    const late = await callRoute(verifyEmail, verifyRequest(expired));

    expect(first.status).toBe(200);
    expect(verifiedAt).not.toBeNull();
    expect(reused.status).toBe(400);
    expect(late.status).toBe(400);
    const reusedText = await reused.text();
    expect((JSON.parse(reusedText) as { code: string }).code).toBe("VERIFICATION_TOKEN_INVALID");
    expect(await late.text()).toBe(reusedText);
  });
});

describe("utente non verificato", () => {
  // covers: AC-1403-3
  it("non avvia estrazioni (403 EMAIL_NOT_VERIFIED, nessun job) ma usa il resto dell'app", async () => {
    const { user, cookie } = await createUserWithSession({ displayName: "t1403-non-verificato", emailVerified: false });
    const project = await prisma.project.create({ data: { name: "Progetto T-1403", owner_user_id: user.id } });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
    await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: "scarpe da corsa" } });

    const run = await callRoute(runProject, {
      method: "POST",
      url: `/api/projects/${project.id}/run`,
      cookie,
      body: { subprojectId: section.id },
      params: { id: project.id },
    });
    const preferences = await callRoute(getPreferences, { url: "/api/user/preferences", cookie });

    expect(run.status).toBe(403);
    expect(((await run.json()) as { code: string }).code).toBe("EMAIL_NOT_VERIFIED");
    expect(await prisma.job.count({ where: { subproject_id: section.id } })).toBe(0);
    expect(preferences.status).toBe(200);
  });
});

describe("nuovo invio dell'email di verifica", () => {
  // covers: AC-1403-4
  it("al massimo 1 invio ogni 60 s e 5 token nelle ultime 24 h, con Retry-After sul 429", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T0.getTime() - 2 * 60 * 1000));
    const { user, cookie } = await createUserWithSession({ displayName: "t1403-reinvio", emailVerified: false });
    await issueVerificationToken(user.id);
    expect(await prisma.emailVerificationToken.count({ where: { user_id: user.id } })).toBe(1);

    const resendAt = async (offsetSeconds: number) => {
      vi.setSystemTime(new Date(T0.getTime() + offsetSeconds * 1000));
      return callRoute(resendVerification, { method: "POST", url: "/api/auth/verify-email/resend", cookie });
    };

    const first = await resendAt(0);
    const tooSoon = await resendAt(10);
    const later = [await resendAt(71), await resendAt(132), await resendAt(193), await resendAt(254)];

    expect(first.status).toBe(200);
    expect(tooSoon.status).toBe(429);
    const retryAfter = Number(tooSoon.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(later.map((response) => response.status)).toEqual([200, 200, 200, 429]);
    expect(await prisma.emailVerificationToken.count({ where: { user_id: user.id } })).toBe(5);
  });
});

describe("nuovo invio con Resend non configurato (D-11 emendata il 2026-10-07)", () => {
  it("risponde 503 EMAIL_UNAVAILABLE e la registrazione resta 202", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { cookie } = await createUserWithSession({ displayName: "t1403-senza-resend", emailVerified: false });

    const resend = await callRoute(resendVerification, { method: "POST", url: "/api/auth/verify-email/resend", cookie });
    const registered = await callRoute(register, registration("senza-resend@example.com"));
    await flushAfter();

    expect(resend.status).toBe(503);
    expect(((await resend.json()) as { code: string }).code).toBe("EMAIL_UNAVAILABLE");
    expect(registered.status).toBe(202);
    expect(await prisma.user.count({ where: { email: "senza-resend@example.com" } })).toBe(1);
    expect(await prisma.emailOutbox.count()).toBe(0);
  });
});

describe("registrazione con email già registrata", () => {
  // covers: AC-1403-5
  it("risponde come per un'email nuova, senza cookie, non tocca l'account e invia account-exists", async () => {
    const { user } = await createUserWithSession({ email: "mario.rossi@example.com", password: "password-di-mario" });
    expect(await prisma.emailOutbox.count()).toBe(0);

    const existing = await callRoute(register, registration("mario.rossi@example.com"));
    const fresh = await callRoute(register, registration("nuovo2@example.com"));
    await flushAfter();

    expect(existing.status).toBe(202);
    expect(fresh.status).toBe(202);
    expect(await existing.text()).toBe(await fresh.text());
    expect(existing.headers.get("set-cookie")).toBeNull();
    expect(fresh.headers.get("set-cookie")).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password_hash).toBe(user.password_hash);
    const sent = await prisma.emailOutbox.findMany({ select: { to_address: true, template: true }, orderBy: { to_address: "asc" } });
    expect(sent).toEqual([
      { to_address: "mario.rossi@example.com", template: "account-exists" },
      { to_address: "nuovo2@example.com", template: "verify-email" },
    ]);
  });
});
