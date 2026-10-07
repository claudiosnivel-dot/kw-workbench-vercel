// Gate di T-504 (AC-504-4): utente inesistente e password errata costano lo stesso calcolo e la stessa risposta.
// impacted-by: T-1401 (accesso con l'email: 'anna' e 'nessuno' diventano anna@example.test e nessuno@example.test)
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { verifyPassword } from "@/lib/security/password";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

vi.mock("@/lib/security/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/password")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const verifySpy = vi.mocked(verifyPassword);

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("login con email esistente e inesistente", () => {
  // covers: AC-504-4
  it("risponde 401 con body identico e verifica la password esattamente una volta in entrambi i casi", async () => {
    await createUserWithSession({ displayName: "anna" });

    verifySpy.mockClear();
    const wrongPassword = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { email: "anna@example.test", password: "password-errata" },
    });
    const callsForExisting = verifySpy.mock.calls.length;

    verifySpy.mockClear();
    const unknownUser = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { email: "nessuno@example.test", password: "password-errata" },
    });
    const callsForUnknown = verifySpy.mock.calls.length;

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(await unknownUser.text()).toBe(await wrongPassword.text());
    expect(callsForExisting).toBe(1);
    expect(callsForUnknown).toBe(1);
  });
});
