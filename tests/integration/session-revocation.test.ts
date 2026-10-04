// Gate di T-501 (AC-501-1…AC-501-4): sessioni revocabili con users.session_version e token minimale.
import { UserRole, UserStatus } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchAdminUser } from "@/app/api/admin/users/[id]/route";
import { PATCH as patchAuthConfig } from "@/app/api/auth/config/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logoutAll } from "@/app/api/auth/logout-all/route";
import { GET as getPreferences, PATCH as patchPreferences } from "@/app/api/user/preferences/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, TEST_USER_PASSWORD } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const NEW_PASSWORD = "nuova-password-501";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

/** Cookie `kwb_session=…` dal Set-Cookie di una risposta, o null se assente. */
function sessionCookieFrom(response: Response): string | null {
  const header = response.headers.get("set-cookie");
  const match = header?.match(/kwb_session=([^;]*)/);
  return match ? `kwb_session=${match[1]}` : null;
}

async function loginCookie(username: string, password = TEST_USER_PASSWORD): Promise<string> {
  const response = await callRoute(login, { method: "POST", url: "/api/auth/login", body: { username, password } });
  expect(response.status).toBe(200);
  const cookie = sessionCookieFrom(response);
  expect(cookie).not.toBeNull();
  return cookie as string;
}

async function preferencesStatus(cookie: string): Promise<number> {
  return (await callRoute(getPreferences, { url: "/api/user/preferences", cookie })).status;
}

async function sessionVersionOf(userId: string): Promise<number> {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).session_version;
}

describe("cambio password dell'utente", () => {
  // covers: AC-501-1
  it("riemette il cookie solo al dispositivo corrente e revoca l'altro", async () => {
    await createUserWithSession({ username: "utente-a" });
    const first = await loginCookie("utente-a");
    const second = await loginCookie("utente-a");

    const response = await callRoute(patchAuthConfig, {
      method: "PATCH",
      url: "/api/auth/config",
      cookie: first,
      body: { currentPassword: TEST_USER_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
    });
    const renewed = sessionCookieFrom(response);

    expect(response.status).toBe(200);
    expect(renewed).not.toBeNull();
    expect(renewed).not.toBe("kwb_session=");
    expect(await preferencesStatus(second)).toBe(401);
    expect(await preferencesStatus(renewed as string)).toBe(200);
  });
});

describe("reset password e sospensione da admin", () => {
  // covers: AC-501-2
  it("incrementano session_version di B di 1 e il vecchio cookie di B riceve 401", async () => {
    const { cookie: rootCookie } = await createUserWithSession({
      username: "root-501",
      role: UserRole.ADMIN,
      isRootAdmin: true,
    });

    const cases = [
      { username: "utente-b-password", body: { newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } },
      { username: "utente-b-sospeso", body: { status: UserStatus.SUSPENDED } },
    ];

    for (const testCase of cases) {
      const { user, cookie } = await createUserWithSession({ username: testCase.username });
      const before = await sessionVersionOf(user.id);
      expect(await preferencesStatus(cookie)).toBe(200);

      const response = await callRoute(patchAdminUser, {
        method: "PATCH",
        url: `/api/admin/users/${user.id}`,
        cookie: rootCookie,
        body: testCase.body,
        params: { id: user.id },
      });

      expect(response.status).toBe(200);
      expect(await sessionVersionOf(user.id)).toBe(before + 1);
      expect(await preferencesStatus(cookie)).toBe(401);
    }
  });
});

describe("esci da tutti i dispositivi", () => {
  // covers: AC-501-3
  it("azzera il cookie, incrementa session_version e revoca entrambi i cookie", async () => {
    const { user } = await createUserWithSession({ username: "utente-c" });
    const first = await loginCookie("utente-c");
    const second = await loginCookie("utente-c");
    const before = await sessionVersionOf(user.id);

    const response = await callRoute(logoutAll, { method: "POST", url: "/api/auth/logout-all", cookie: first });
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toMatch(/^kwb_session=;/);
    expect(setCookie).toMatch(/;\s*Max-Age=0(;|$)/);
    expect(await sessionVersionOf(user.id)).toBe(before + 1);
    expect(await preferencesStatus(first)).toBe(401);
    expect(await preferencesStatus(second)).toBe(401);
  });
});

describe("token minimale e preferenze", () => {
  // covers: AC-501-4
  it("il payload ha solo uid, ver, iat ed exp e PATCH delle preferenze non emette Set-Cookie", async () => {
    await createUserWithSession({ username: "utente-d" });
    const cookie = await loginCookie("utente-d");

    const payloadPart = cookie.replace(/^kwb_session=/, "").split(".")[0];
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "uid", "ver"]);

    const response = await callRoute(patchPreferences, {
      method: "PATCH",
      url: "/api/user/preferences",
      cookie,
      body: { themeMode: "LIGHT" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
