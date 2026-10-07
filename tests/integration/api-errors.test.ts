// Gate di T-503 (AC-503-1…AC-503-4): errori API uniformi {error, code, requestId} senza dettagli interni.
import { randomBytes } from "node:crypto";
import { Prisma, UserRole } from "@/lib/generated/prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchAdminUser } from "@/app/api/admin/users/[id]/route";
import { POST as createAdminUser } from "@/app/api/admin/users/route";
import { PATCH as patchAuthConfig } from "@/app/api/auth/config/route";
import { POST as register } from "@/app/api/auth/register/route";
import { PATCH as patchBranding } from "@/app/api/settings/branding/route";
import { resetEnvForTests } from "@/lib/env";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type ErrorBody = { error?: string; code?: string; requestId?: string };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
  // Chiave generata a ogni esecuzione: serve a cifrare i valori di app_settings prima dell'upsert.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  resetEnvForTests();
});

afterAll(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createRootAdmin() {
  return createUserWithSession({ displayName: "root-503", role: UserRole.ADMIN, isRootAdmin: true });
}

describe("JSON malformato", () => {
  // covers: AC-503-1
  it("le quattro route rispondono 400 INVALID_JSON e nessuna 500", async () => {
    const { cookie: rootCookie } = await createRootAdmin();
    const { user: target, cookie: userCookie } = await createUserWithSession({ displayName: "utente-503" });

    const responses = [
      await callRoute(register, { method: "POST", url: "/api/auth/register", body: "not-json" }),
      await callRoute(patchAuthConfig, { method: "PATCH", url: "/api/auth/config", body: "not-json", cookie: userCookie }),
      await callRoute(patchAdminUser, {
        method: "PATCH",
        url: `/api/admin/users/${target.id}`,
        body: "not-json",
        cookie: rootCookie,
        params: { id: target.id },
      }),
      await callRoute(patchBranding, { method: "PATCH", url: "/api/settings/branding", body: "not-json", cookie: rootCookie }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(((await response.json()) as ErrorBody).code).toBe("INVALID_JSON");
    }
  });
});

describe("errore imprevisto del DB", () => {
  // covers: AC-503-2
  it("risponde 500 INTERNAL_ERROR con il requestId dell'header, senza dettagli interni, e scrive una riga di log", async () => {
    await createUserWithSession({ displayName: "utente-esistente" });
    vi.spyOn(prisma.user, "create").mockRejectedValueOnce(
      new Error("connect ECONNREFUSED db.example.supabase.co:5432 (prisma)")
    );
    // impacted-by: T-602 (la riga di log del 500 la scrive il logger JSON su stdout, non console.error)
    const written: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });

    const response = await callRoute(register, {
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-request-id": "req-test-0001" },
      // impacted-by: T-1401, T-1405 (email e accettazione dei termini correnti)
      body: {
        email: "nuovo-503@example.test",
        password: "password-503",
        confirmPassword: "password-503",
        acceptTerms: true,
        termsVersion: LEGAL_TERMS_VERSION,
      },
    });
    const text = await response.text();
    const body = JSON.parse(text) as ErrorBody;

    expect(response.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.requestId).toBe("req-test-0001");
    expect(text.toLowerCase()).not.toContain("supabase");
    expect(text.toLowerCase()).not.toContain("prisma");
    expect(text).not.toMatch(/\bat\s+\S+\s+\(/);
    const errorLines = written
      .join("")
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as { level?: string; requestId?: string })
      .filter((entry) => entry.level === "error");
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0].requestId).toBe("req-test-0001");
  });
});

describe("creazione utente da admin", () => {
  // covers: AC-503-3
  // impacted-by: T-1401 (AC-503-3 emendato: email già registrata 409 EMAIL_TAKEN, nome mostrato non valido 400)
  it("email duplicata dà 409 EMAIL_TAKEN e nome mostrato non valido 400 VALIDATION_ERROR", async () => {
    const { cookie } = await createRootAdmin();
    await createUserWithSession({ displayName: "mario" });

    const duplicate = await callRoute(createAdminUser, {
      method: "POST",
      url: "/api/admin/users",
      cookie,
      body: { email: "mario@example.test", password: "password-503", confirmPassword: "password-503" },
    });
    const invalid = await callRoute(createAdminUser, {
      method: "POST",
      url: "/api/admin/users",
      cookie,
      body: { email: "nome-lungo@example.test", displayName: "x".repeat(61), password: "password-503", confirmPassword: "password-503" },
    });

    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as ErrorBody).code).toBe("EMAIL_TAKEN");
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as ErrorBody).code).toBe("VALIDATION_ERROR");
  });
});

describe("branding con errore Prisma imprevisto", () => {
  // covers: AC-503-4
  it("risponde 500 INTERNAL_ERROR senza il messaggio dell'errore Prisma", async () => {
    const { cookie } = await createRootAdmin();
    const prismaError = new Prisma.PrismaClientKnownRequestError("deadlock-interno-su-app_settings", {
      code: "P2034",
      clientVersion: "7.10.0",
    });
    const upsert = vi.spyOn(prisma.appSetting, "upsert").mockImplementation(() => {
      throw prismaError;
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await callRoute(patchBranding, {
      method: "PATCH",
      url: "/api/settings/branding",
      cookie,
      body: { appName: "Nome valido" },
    });
    const text = await response.text();

    expect(upsert).toHaveBeenCalled();
    expect(response.status).toBe(500);
    expect((JSON.parse(text) as ErrorBody).code).toBe("INTERNAL_ERROR");
    expect(text).not.toContain("deadlock-interno-su-app_settings");
  });
});
