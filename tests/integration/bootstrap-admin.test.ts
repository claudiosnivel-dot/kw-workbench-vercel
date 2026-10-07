// Gate di T-201 (AC-201-4): in produzione un refuso non disattiva l'auth e il bootstrap del primo utente non
// accetta credenziali di default.
// impacted-by: T-1401 (AC-201-4 emendato: il bootstrap crea il root admin di APP_ADMIN_EMAIL con password casuale,
// non più APP_AUTH_USERNAME e APP_AUTH_PASSWORD)
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as onboardingState } from "@/app/api/onboarding/state/route";
import { resetEnvForTests } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const ADMIN_EMAIL = "root@example.test";

beforeAll(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_AUTH_ENABLED", "ture");
  vi.stubEnv("APP_ADMIN_EMAIL", ADMIN_EMAIL);
  vi.stubEnv("APP_ENCRYPTION_KEY", "y".repeat(40));
  // impacted-by: T-1203 (JOB_SIGNING_SECRET obbligatoria in produzione)
  vi.stubEnv("JOB_SIGNING_SECRET", "z".repeat(40));
  // impacted-by: T-1402 (in produzione le email partono con Resend: trasporto, chiave, mittente e URL pubblico)
  vi.stubEnv("EMAIL_TRANSPORT", "resend");
  vi.stubEnv("RESEND_API_KEY", "re_test_non_reale");
  vi.stubEnv("EMAIL_FROM", "noreply@example.test");
  vi.stubEnv("APP_PUBLIC_URL", "https://app.example.test");
  resetEnvForTests();
});

afterAll(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("bootstrap del primo utente in produzione", () => {
  // covers: AC-201-4
  it("sessione anonima 401; il login con changeme non riesce e il bootstrap crea solo il root admin di APP_ADMIN_EMAIL", async () => {
    // impacted-by: T-1101 (rotta /api/auth/session rimossa): l'auth resta attiva, una rotta autenticata risponde 401.
    const anonymous = await callRoute(onboardingState, { url: "/api/onboarding/state" });
    expect(anonymous.status).toBe(401);

    const weak = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { email: ADMIN_EMAIL, password: "changeme" },
    });

    expect(weak.status).not.toBe(200);
    expect(weak.status).toBe(401);
    expect(weak.headers.get("set-cookie")).toBeNull();
    const users = await prisma.user.findMany({ select: { email: true, is_root_admin: true } });
    expect(users).toEqual([{ email: ADMIN_EMAIL, is_root_admin: true }]);
  });
});
