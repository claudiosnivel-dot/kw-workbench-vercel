// Gate di T-1401: identità via email (AC-1401-1…4).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Prisma, UserRole } from "@/lib/generated/prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createAdminUser } from "@/app/api/admin/users/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { ensureLegacyDefaultUser } from "@/lib/auth/credentials";
import { resetEnvForTests } from "@/lib/env";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { configureTestTurnstile, TEST_TURNSTILE_TOKEN } from "../helpers/turnstile";

type DriverAdapterFailure = Prisma.PrismaClientKnownRequestError & {
  meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
};

const require = createRequire(import.meta.url);
const PRISMA_CLI = require.resolve("prisma/build/index.js");
const PASSWORD = "password-1401-non-reale";

function registration(email: string) {
  return {
    method: "POST",
    url: "/api/auth/register",
    body: {
      email,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      acceptTerms: true,
      termsVersion: LEGAL_TERMS_VERSION,
      turnstileToken: TEST_TURNSTILE_TOKEN,
    },
  };
}

function loginRequest(email: string, password: string) {
  return { method: "POST", url: "/api/auth/login", body: { email, password } };
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
  await resetDatabase();
  // impacted-by: T-1606 (registrazione pubblica aperta solo con il lancio commerciale attivo, D-32)
  await setCommercialLaunchForTests("live");
  // impacted-by: T-1702 (CAPTCHA obbligatorio sulla registrazione aperta: chiavi di prova e siteverify simulato)
  configureTestTurnstile();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

describe("email unica senza distinzione di maiuscole", () => {
  // covers: AC-1401-1
  it("la seconda registrazione risponde 202, la creazione dell'admin 409 EMAIL_TAKEN e resta una sola riga", async () => {
    const { cookie: rootCookie } = await createUserWithSession({ displayName: "root-1401", role: UserRole.ADMIN, isRootAdmin: true });

    const first = await callRoute(register, registration("Mario.Rossi@Example.COM"));
    const second = await callRoute(register, registration("mario.rossi@example.com"));
    const fromAdmin = await callRoute(createAdminUser, {
      method: "POST",
      url: "/api/admin/users",
      cookie: rootCookie,
      body: { email: "mario.rossi@example.com", password: PASSWORD, confirmPassword: PASSWORD },
    });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await second.json()).toEqual({ code: "CHECK_EMAIL" });
    expect(fromAdmin.status).toBe(409);
    expect(((await fromAdmin.json()) as { code: string }).code).toBe("EMAIL_TAKEN");
    expect(await prisma.user.count({ where: { email: "mario.rossi@example.com" } })).toBe(1);
    expect(await prisma.user.count({ where: { email: { contains: "mario.rossi", mode: "insensitive" } } })).toBe(1);
  });
});

describe("login con email", () => {
  // covers: AC-1401-2
  it("accetta l'email con spazi e maiuscole; password errata ed email inesistente hanno 401 con corpo identico", async () => {
    await createUserWithSession({ email: "mario.rossi@example.com", password: PASSWORD });

    const ok = await callRoute(login, loginRequest(" MARIO.ROSSI@example.com ", PASSWORD));
    const wrongPassword = await callRoute(login, loginRequest("mario.rossi@example.com", "password-errata"));
    const unknownEmail = await callRoute(login, loginRequest("nessuno@example.com", PASSWORD));

    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/^kwb_session=[^;]+;/);
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await unknownEmail.text()).toBe(await wrongPassword.text());
  });
});

describe("root admin da APP_ADMIN_EMAIL", () => {
  function runSeed(): void {
    const seed = spawnSync(process.execPath, [PRISMA_CLI, "db", "seed"], {
      env: { ...process.env, APP_ADMIN_EMAIL: "root@example.test" },
      encoding: "utf8",
      timeout: 180_000,
    });
    expect(seed.status, seed.stdout + seed.stderr).toBe(0);
  }

  // covers: AC-1401-3
  it("con users vuota bootstrap e seed eseguiti due volte lasciano un solo root admin verificato", async () => {
    vi.stubEnv("APP_ADMIN_EMAIL", "root@example.test");
    resetEnvForTests();

    await ensureLegacyDefaultUser();
    await ensureLegacyDefaultUser();
    runSeed();
    runSeed();

    const roots = await prisma.user.findMany({ where: { is_root_admin: true } });
    expect(roots).toHaveLength(1);
    expect(roots[0].email).toBe("root@example.test");
    expect(roots[0].email_verified_at).not.toBeNull();
    expect(await prisma.user.count()).toBe(1);
  }, 400_000);

  // covers: AC-1401-3
  it("il seed assegna APP_ADMIN_EMAIL verificata al root admin legacy senza email, una volta sola", async () => {
    const legacy = await prisma.user.create({
      data: { display_name: "admin", password_hash: "hash-fittizio", role: UserRole.ADMIN, is_root_admin: true },
    });

    runSeed();
    const first = await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } });
    runSeed();
    const second = await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } });

    expect(first.email).toBe("root@example.test");
    expect(first.email_verified_at).not.toBeNull();
    expect(second.email_verified_at).toEqual(first.email_verified_at);
    expect(second.password_hash).toBe("hash-fittizio");
  }, 400_000);
});

describe("vincolo di email minuscola", () => {
  // covers: AC-1401-4
  it("un INSERT SQL diretto con maiuscole nell'email viola users_email_lowercase (23514)", async () => {
    const error = await prisma
      .$executeRawUnsafe(
        `INSERT INTO users (id, email, display_name, password_hash, updated_at) VALUES ('u-1401', 'Upper@Example.com', 'Upper', 'x', now())`
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as DriverAdapterFailure).meta?.driverAdapterError?.cause?.originalCode).toBe("23514");
    expect(await prisma.user.count()).toBe(0);
  });
});
