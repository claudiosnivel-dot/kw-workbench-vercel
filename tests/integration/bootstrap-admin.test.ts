// Gate di T-201 (AC-201-4): in produzione un refuso non disattiva l'auth e il bootstrap del
// primo utente rifiuta la password di default.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as session } from "@/app/api/auth/session/route";
import { resetEnvForTests } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const BOOTSTRAP_USERNAME = "bootstrap-admin";
// Password di bootstrap fittizia di 16 caratteri, mai un valore reale.
const STRONG_PASSWORD = "bootstrap-pw-16c";

beforeAll(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_AUTH_ENABLED", "ture");
  vi.stubEnv("APP_AUTH_USERNAME", BOOTSTRAP_USERNAME);
  vi.stubEnv("APP_AUTH_PASSWORD", "changeme");
  vi.stubEnv("APP_ENCRYPTION_KEY", "y".repeat(40));
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
  it("sessione anonima 401, login con changeme rifiutato senza righe, login con password valida crea il root admin", async () => {
    const anonymous = await callRoute(session, { url: "/api/auth/session" });
    expect(anonymous.status).toBe(401);

    // impacted-by: T-503 (l'errore di bootstrap diventa un 500 INTERNAL_ERROR di withApiErrors: il motivo
    // resta nel log del server e non arriva al client)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const weak = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { username: BOOTSTRAP_USERNAME, password: "changeme" },
    });
    const weakText = await weak.text();
    expect(weak.status).not.toBe(200);
    expect(weak.status).toBe(500);
    expect(weak.headers.get("set-cookie")).toBeNull();
    expect(weakText).not.toContain("APP_AUTH_PASSWORD");
    expect(consoleError.mock.calls.flat().some((arg) => String(arg).includes("APP_AUTH_PASSWORD"))).toBe(true);
    consoleError.mockRestore();
    expect(await prisma.user.count()).toBe(0);

    vi.stubEnv("APP_AUTH_PASSWORD", STRONG_PASSWORD);
    resetEnvForTests();
    const ok = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { username: BOOTSTRAP_USERNAME, password: STRONG_PASSWORD },
    });

    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/^kwb_session=[^;]+;/);
    const users = await prisma.user.findMany({ select: { is_root_admin: true } });
    expect(users).toEqual([{ is_root_admin: true }]);
  });
});
