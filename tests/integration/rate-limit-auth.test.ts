// Gate di T-1701 (AC-1701-1…5): rate limiter a finestra scorrevole su Postgres per login, registrazione, richiesta di
// reset e avvii di estrazione, con 429 RATE_LIMITED e Retry-After, chiavi dall'IP del client solo su Vercel.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as runSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/run/route";
import { setPlansForTesting } from "@/lib/billing/plans";
import { resetEnvForTests } from "@/lib/env";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, pruneRateLimitHits } from "@/lib/security/rate-limit";
import { verifyPassword } from "@/lib/security/password";
import { createUserWithSession, TEST_USER_PASSWORD } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { configureTestBilling } from "../helpers/paddle";
import { configureTestTurnstile, siteverifySuccess, TEST_TURNSTILE_TOKEN } from "../helpers/turnstile";

vi.mock("@/lib/security/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/password")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});
vi.mock("@/lib/modules/jobs/continuation", () => ({ scheduleJobContinuation: vi.fn() }));

const verifySpy = vi.mocked(verifyPassword);
const T0 = new Date("2026-10-08T09:00:00.000Z");

type ErrorBody = { code?: string; retryAfter?: number };

function loginFrom(ip: string, email: string, password: string) {
  return callRoute(login, { method: "POST", url: "/api/auth/login", headers: { "x-forwarded-for": ip }, body: { email, password } });
}

function retryAfterOf(response: Response): number {
  return Number(response.headers.get("retry-after"));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
  // Su Vercel x-forwarded-for è l'IP pubblico del client: solo lì entra nelle chiavi.
  vi.stubEnv("VERCEL", "1");
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.useRealTimers();
  setPlansForTesting(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

describe("login", () => {
  // covers: AC-1701-1
  it("oltre la soglia per IP+email il login giusto riceve 429 senza verificare la password né aggiornare l'utente", async () => {
    vi.stubEnv("RATE_LIMIT_LOGIN_IP_EMAIL_MAX", "3");
    const { user } = await createUserWithSession({ email: "a@example.com", displayName: "utente-a" });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await loginFrom("203.0.113.5", "a@example.com", "password-errata")).status).toBe(401);
    }

    verifySpy.mockClear();
    const blocked = await loginFrom("203.0.113.5", "a@example.com", TEST_USER_PASSWORD);

    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as ErrorBody).code).toBe("RATE_LIMITED");
    expect(Number.isInteger(retryAfterOf(blocked))).toBe(true);
    expect(retryAfterOf(blocked)).toBeGreaterThan(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).last_login_at).toBeNull();
    expect(verifySpy).toHaveBeenCalledTimes(0);
  });

  // covers: AC-1701-2
  it("da un altro IP e dopo la finestra lo stesso login riceve 200 con il cookie di sessione", async () => {
    vi.stubEnv("RATE_LIMIT_LOGIN_IP_EMAIL_MAX", "3");
    await createUserWithSession({ email: "a@example.com", displayName: "utente-a" });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await loginFrom("203.0.113.5", "a@example.com", "password-errata");
    }
    expect((await loginFrom("203.0.113.5", "a@example.com", TEST_USER_PASSWORD)).status).toBe(429);

    const otherIp = await loginFrom("198.51.100.7", "a@example.com", TEST_USER_PASSWORD);
    vi.setSystemTime(new Date(T0.getTime() + 16 * 60_000));
    const afterWindow = await loginFrom("203.0.113.5", "a@example.com", TEST_USER_PASSWORD);

    for (const response of [otherIp, afterWindow]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toMatch(/^kwb_session=[^;]+;/);
    }
  });
});

describe("registrazione e richiesta di reset", () => {
  // covers: AC-1701-3
  it("la terza richiesta di ogni serie riceve 429 e le prime due di reset non distinguono le email", async () => {
    vi.stubEnv("RATE_LIMIT_REGISTER_IP_MAX", "2");
    vi.stubEnv("RATE_LIMIT_RESET_EMAIL_MAX", "2");
    await createUserWithSession({ email: "esistente@example.com", displayName: "esistente" });
    await setCommercialLaunchForTests("live");
    const { siteverify } = configureTestTurnstile();
    const registration = (n: number) =>
      callRoute(register, {
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-forwarded-for": "203.0.113.20" },
        body: {
          email: `nuovo-${n}@example.com`,
          password: "password-1701-non-reale",
          confirmPassword: "password-1701-non-reale",
          acceptTerms: true,
          termsVersion: LEGAL_TERMS_VERSION,
          turnstileToken: TEST_TURNSTILE_TOKEN,
        },
      });
    const reset = (email: string) =>
      callRoute(requestReset, {
        method: "POST",
        url: "/api/auth/password-reset/request",
        headers: { "x-forwarded-for": "203.0.113.21" },
        body: { email, turnstileToken: TEST_TURNSTILE_TOKEN },
      });

    const registrations = [await registration(1), await registration(2), await registration(3)];
    siteverify.mockImplementation(async () => siteverifySuccess("password-reset"));
    const existing = [await reset("esistente@example.com"), await reset("esistente@example.com"), await reset("esistente@example.com")];
    const missing = [await reset("nessuno@example.com"), await reset("nessuno@example.com"), await reset("nessuno@example.com")];

    for (const series of [registrations, existing, missing]) {
      expect(series[2].status).toBe(429);
      expect(retryAfterOf(series[2])).toBeGreaterThan(0);
    }
    expect(registrations.slice(0, 2).map((response) => response.status)).toEqual([202, 202]);
    for (const index of [0, 1]) {
      expect(existing[index].status).toBe(missing[index].status);
      expect(await existing[index].text()).toBe(await missing[index].text());
    }
  });
});

describe("chiavi, concorrenza e pulizia", () => {
  // covers: AC-1701-4
  it("la chiave usa il primo IP di x-forwarded-for, due consumi concorrenti ne ammettono uno e la pulizia svuota", async () => {
    await loginFrom("203.0.113.5, 10.0.0.1", "chiave@example.com", "password-errata");
    const keys = (await prisma.rateLimitHit.findMany({ select: { key: true } })).map((row) => row.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.includes("203.0.113.5") && !key.includes("10.0.0.1"))).toBe(true);

    const rule = { max: 1, windowSeconds: 60 };
    const concurrent = await Promise.all([
      consumeRateLimit(keys[0], rule),
      consumeRateLimit(keys[0], rule),
      consumeRateLimit("concorrente", rule),
      consumeRateLimit("concorrente", rule),
    ]);
    // La chiave del login ha già il suo tentativo: con soglia 1 nessuno dei due passa; sulla chiave nuova uno solo.
    expect(concurrent.slice(0, 2).filter((result) => result.allowed)).toHaveLength(0);
    expect(concurrent.slice(2).filter((result) => result.allowed)).toHaveLength(1);

    await pruneRateLimitHits(new Date(T0.getTime() + 2 * 86_400_000));
    expect(await prisma.rateLimitHit.count()).toBe(0);
  });

  it("fuori da Vercel la parte IP della chiave vale unknown anche con x-forwarded-for", async () => {
    vi.stubEnv("VERCEL", undefined);
    await loginFrom("203.0.113.5", "fuori@example.com", "password-errata");
    const keys = (await prisma.rateLimitHit.findMany({ select: { key: true } })).map((row) => row.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.includes("unknown") && !key.includes("203.0.113.5"))).toBe(true);
  });
});

describe("avvii di estrazione", () => {
  // covers: AC-1701-5
  it("con il lancio attivo il secondo avvio oltre la soglia del workspace è un 429; in pausa la regola non si applica", async () => {
    configureTestBilling();
    vi.stubEnv("RATE_LIMIT_RUN_START_MAX", "1");
    const { user, cookie, workspaceId } = await createUserWithSession({ displayName: "t1701-member" });
    const project = await prisma.project.create({ data: { name: "Avvii", workspace_id: workspaceId, created_by_user_id: user.id } });
    const sections = await Promise.all(
      ["Prima", "Seconda"].map((name, position) =>
        prisma.subproject.create({ data: { project_id: project.id, name, position, seeds: { create: [{ project_id: project.id, keyword: name }] } } })
      )
    );
    const start = (sectionId: string) =>
      callRoute(runSection, {
        method: "POST",
        url: `/api/projects/${project.id}/subprojects/${sectionId}/run`,
        cookie,
        params: { id: project.id, subprojectId: sectionId },
      });
    await setCommercialLaunchForTests("live");

    const first = await start(sections[0].id);
    const second = await start(sections[1].id);
    const jobsAfterLimit = await prisma.job.count({ where: { project: { workspace_id: workspaceId } } });
    await setCommercialLaunchForTests("paused");
    const paused = await start(sections[1].id);

    expect(first.status).toBe(202);
    expect(second.status).toBe(429);
    expect(((await second.json()) as ErrorBody).code).toBe("RATE_LIMITED");
    expect(retryAfterOf(second)).toBeGreaterThan(0);
    expect(jobsAfterLimit).toBe(1);
    expect(paused.status).toBe(202);
  });
});
