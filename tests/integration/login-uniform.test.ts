// Gate di T-504 (AC-504-4): username inesistente e password errata costano lo stesso calcolo e la stessa risposta.
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

describe("login con username esistente e inesistente", () => {
  // covers: AC-504-4
  it("risponde 401 con body identico e verifica la password esattamente una volta in entrambi i casi", async () => {
    await createUserWithSession({ username: "anna" });

    verifySpy.mockClear();
    const wrongPassword = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { username: "anna", password: "password-errata" },
    });
    const callsForExisting = verifySpy.mock.calls.length;

    verifySpy.mockClear();
    const unknownUser = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { username: "nessuno", password: "password-errata" },
    });
    const callsForUnknown = verifySpy.mock.calls.length;

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(await unknownUser.text()).toBe(await wrongPassword.text());
    expect(callsForExisting).toBe(1);
    expect(callsForUnknown).toBe(1);
  });
});
