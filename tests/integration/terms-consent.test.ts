// Gate di T-1405: consenso a termini e privacy con versione (AC-1405-1…4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as acceptTerms } from "@/app/api/auth/accept-terms/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { findAuthUserById } from "@/lib/auth/credentials";
import { resetEnvForTests } from "@/lib/env";
import { requireCurrentTerms } from "@/lib/legal/consent";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

// Versione corrente scritta nel test (lib/legal/version.ts): il server la confronta con la propria costante.
const CURRENT_TERMS = "segnaposto-2026-10-07";
const PASSWORD = "password-1405-non-reale";

function registerWith(extra: Record<string, unknown>) {
  return callRoute(register, {
    method: "POST",
    url: "/api/auth/register",
    body: { email: "consenso@example.com", password: PASSWORD, confirmPassword: PASSWORD, ...extra },
  });
}

/** Destinazione di un errore NEXT_REDIRECT (digest NEXT_REDIRECT;tipo;url;status;), null senza redirect. */
function redirectTarget(run: () => void): string | null {
  try {
    run();
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;") ? digest.split(";")[2] : "errore diverso";
  }
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
  vi.stubEnv("APP_ADMIN_EMAIL", "root@example.test");
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("consenso alla registrazione", () => {
  // covers: AC-1405-1
  it("senza acceptTerms risponde 400 TERMS_NOT_ACCEPTED; con la versione corrente registra versione e istante", async () => {
    const usersBefore = await prisma.user.count();
    const refused = await registerWith({});
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { code: string }).code).toBe("TERMS_NOT_ACCEPTED");
    expect(await prisma.user.count()).toBe(usersBefore);

    const requestedAt = Date.now();
    const accepted = await registerWith({ acceptTerms: true, termsVersion: CURRENT_TERMS });

    expect(accepted.status).toBe(202);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "consenso@example.com" } });
    expect(user.accepted_terms_version).toBe(CURRENT_TERMS);
    expect(Math.abs((user.accepted_terms_at as Date).getTime() - requestedAt)).toBeLessThanOrEqual(5_000);
  });

  // covers: AC-1405-2
  it("con una versione dei termini diversa risponde 409 TERMS_VERSION_CHANGED senza creare utenti", async () => {
    const usersBefore = await prisma.user.count();

    const response = await registerWith({ acceptTerms: true, termsVersion: "versione-vecchia" });

    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("TERMS_VERSION_CHANGED");
    expect(await prisma.user.count()).toBe(usersBefore);
  });
});

describe("riaccettazione al cambio di versione", () => {
  // covers: AC-1405-3
  // covers: AC-1405-4
  it("login con requiresTermsAcceptance e gate verso /accept-terms; dopo l'accettazione il gate passa", async () => {
    const { user, cookie } = await createUserWithSession({
      email: "vecchi-termini@example.com",
      password: PASSWORD,
      acceptedTermsVersion: "versione-vecchia",
    });

    const loggedIn = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { email: "vecchi-termini@example.com", password: PASSWORD },
    });
    expect(loggedIn.status).toBe(200);
    expect(((await loggedIn.json()) as { requiresTermsAcceptance?: boolean }).requiresTermsAcceptance).toBe(true);
    const before = await findAuthUserById(user.id);
    expect(redirectTarget(() => requireCurrentTerms(before!, "/"))).toBe("/accept-terms?next=%2F");

    const accepted = await callRoute(acceptTerms, {
      method: "POST",
      url: "/api/auth/accept-terms",
      cookie,
      body: { termsVersion: CURRENT_TERMS },
    });

    expect(accepted.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).accepted_terms_version).toBe(CURRENT_TERMS);
    const after = await findAuthUserById(user.id);
    expect(redirectTarget(() => requireCurrentTerms(after!, "/"))).toBeNull();
  });
});
