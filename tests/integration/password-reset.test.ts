// Gate di T-1404: recupero password self-service (AC-1404-1…4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as confirmReset } from "@/app/api/auth/password-reset/confirm/route";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { GET as getPreferences } from "@/app/api/user/preferences/route";
import { resetEnvForTests } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { flushAfter } from "../helpers/next-after";

const OLD_PASSWORD = "vecchia-password-1404";
const NEW_PASSWORD = "nuova-password-1404";
const T0 = new Date("2026-10-07T10:00:00.000Z");

function requestFor(email: string) {
  return callRoute(requestReset, { method: "POST", url: "/api/auth/password-reset/request", body: { email } });
}

function confirmWith(token: string, password = NEW_PASSWORD) {
  return callRoute(confirmReset, {
    method: "POST",
    url: "/api/auth/password-reset/confirm",
    body: { token, password, confirmPassword: password },
  });
}

/** Richiesta di reset con le callback after() eseguite; restituisce il token del link dell'email inviata. */
async function resetTokenFor(email: string): Promise<string> {
  await requestFor(email);
  await flushAfter();
  const sent = await prisma.emailOutbox.findFirstOrThrow({ where: { to_address: email, template: "password-reset" } });
  await prisma.emailOutbox.delete({ where: { id: sent.id } });
  const match = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(sent.text);
  expect(match).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

function loginWith(email: string, password: string) {
  return callRoute(login, { method: "POST", url: "/api/auth/login", body: { email, password } });
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("richiesta di reset", () => {
  // covers: AC-1404-1
  it("risponde 202 con corpo identico per email esistente e inesistente; solo l'utente esistente riceve l'email", async () => {
    await createUserWithSession({ email: "a@example.com" });

    const existing = await requestFor("a@example.com");
    const missing = await requestFor("b@example.com");
    await flushAfter();

    expect(existing.status).toBe(202);
    expect(missing.status).toBe(202);
    expect(await existing.text()).toBe(await missing.text());
    expect(await prisma.emailOutbox.count({ where: { to_address: "a@example.com", template: "password-reset" } })).toBe(1);
    expect(await prisma.emailOutbox.count({ where: { to_address: "b@example.com" } })).toBe(0);
  });
});

describe("conferma del reset", () => {
  // covers: AC-1404-2
  it("non emette sessione, revoca il vecchio cookie e solo la nuova password funziona", async () => {
    const { cookie } = await createUserWithSession({ email: "reset@example.com", password: OLD_PASSWORD });
    const token = await resetTokenFor("reset@example.com");

    const confirmed = await confirmWith(token);
    const oldCookie = await callRoute(getPreferences, { url: "/api/user/preferences", cookie });
    const withOld = await loginWith("reset@example.com", OLD_PASSWORD);
    const withNew = await loginWith("reset@example.com", NEW_PASSWORD);

    expect(confirmed.status).toBe(200);
    expect(confirmed.headers.get("set-cookie") ?? "").not.toContain("kwb_session");
    expect(oldCookie.status).toBe(401);
    expect(withOld.status).toBe(401);
    expect(withNew.status).toBe(200);
  });

  // covers: AC-1404-3
  it("token usato, scaduto o mai emesso: 400 RESET_TOKEN_INVALID con corpo identico e password invariata", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const { user } = await createUserWithSession({ email: "token@example.com", password: OLD_PASSWORD });
    const used = await resetTokenFor("token@example.com");
    expect((await confirmWith(used)).status).toBe(200);
    const expired = await resetTokenFor("token@example.com");
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password_hash;
    vi.setSystemTime(new Date(T0.getTime() + (60 * 60 + 1) * 1000));

    const responses = [
      await confirmWith(used, "altra-password-1404"),
      await confirmWith(expired, "altra-password-1404"),
      await confirmWith("token-mai-emesso", "altra-password-1404"),
    ];
    const bodies = await Promise.all(responses.map((response) => response.text()));

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect((JSON.parse(bodies[0]) as { code: string }).code).toBe("RESET_TOKEN_INVALID");
    expect(new Set(bodies).size).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password_hash).toBe(before);
  });

  // covers: AC-1404-4
  it("una nuova richiesta invalida il token della precedente", async () => {
    await createUserWithSession({ email: "doppio@example.com", password: OLD_PASSWORD });
    const firstToken = await resetTokenFor("doppio@example.com");
    const secondToken = await resetTokenFor("doppio@example.com");

    const withFirst = await confirmWith(firstToken);
    const withSecond = await confirmWith(secondToken);

    expect(withFirst.status).toBe(400);
    expect(((await withFirst.json()) as { code: string }).code).toBe("RESET_TOKEN_INVALID");
    expect(withSecond.status).toBe(200);
  });
});
