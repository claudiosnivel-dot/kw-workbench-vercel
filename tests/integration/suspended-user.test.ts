// Gate di T-502 (AC-502-1…AC-502-3): sessione firmata di un utente sospeso → redirect pulito nelle pagine, 401 con codice nelle API.
import { UserStatus } from "@/lib/generated/prisma/enums";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as sessionEnded } from "@/app/api/auth/session-ended/route";
import { GET as onboardingState } from "@/app/api/onboarding/state/route";
import { POST as runProject } from "@/app/api/projects/[id]/run/route";
import { requirePageUser } from "@/lib/auth/page-guard";
import { buildApiErrorMessage, readJsonSafe, type ApiErrorPayload } from "@/lib/client/http";
import { AuthRequiredError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import messages from "@/messages/it.json";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kwb_session" && cookieJar.value ? { name, value: cookieJar.value } : undefined),
  }),
}));

const SESSION_EXPIRED = "Sessione non valida o scaduta. Effettua di nuovo il login.";
// impacted-by: T-1303 (buildApiErrorMessage riceve le traduzioni del namespace errors al posto del testo di ripiego)
const tErrors = createTranslator({ locale: "it", messages, namespace: "errors" });

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  cookieJar.value = undefined;
  await resetDatabase();
});

async function createSuspendedUserWithCookie(username: string) {
  const { user, cookie } = await createUserWithSession({ username });
  await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.SUSPENDED } });
  return { user, cookie };
}

describe("requirePageUser con utente sospeso", () => {
  // covers: AC-502-1
  it("lancia il redirect di Next verso /api/auth/session-ended e non AuthRequiredError", async () => {
    const { cookie } = await createSuspendedUserWithCookie("sospeso-pagina");
    cookieJar.value = cookie.replace(/^kwb_session=/, "");

    const thrown = await requirePageUser().then(
      () => null,
      (error: unknown) => error
    );

    expect(thrown).not.toBeNull();
    expect(thrown).not.toBeInstanceOf(AuthRequiredError);
    const digest = String((thrown as { digest?: unknown }).digest ?? "");
    expect(digest.startsWith("NEXT_REDIRECT;")).toBe(true);
    expect(digest.split(";")).toContain("/api/auth/session-ended");
  });
});

describe("API con utente sospeso", () => {
  // covers: AC-502-2
  it("run e lista progetti rispondono 401 AUTH_REQUIRED e il client mostra il messaggio di sessione scaduta", async () => {
    const { cookie } = await createSuspendedUserWithCookie("sospeso-api");

    const responses = [
      await callRoute(runProject, {
        method: "POST",
        url: "/api/projects/progetto-qualsiasi/run",
        cookie,
        params: { id: "progetto-qualsiasi" },
      }),
      // impacted-by: T-1101 (GET /api/projects rimossa)
      await callRoute(onboardingState, { url: "/api/onboarding/state", cookie }),
    ];

    for (const response of responses) {
      const payload = await readJsonSafe<ApiErrorPayload & { code?: string }>(response);
      expect(response.status).toBe(401);
      expect(payload?.code).toBe("AUTH_REQUIRED");
      expect(buildApiErrorMessage(response, payload, tErrors)).toBe(SESSION_EXPIRED);
    }
  });

  it("buildApiErrorMessage preferisce il messaggio di sessione scaduta anche con body 'Unauthorized'", () => {
    const response = new Response(null, { status: 401 });
    expect(buildApiErrorMessage(response, { error: "Unauthorized" }, tErrors)).toBe(SESSION_EXPIRED);
  });
});

describe("GET /api/auth/session-ended", () => {
  // covers: AC-502-3
  it("azzera il cookie e porta al login solo per l'utente non più attivo", async () => {
    const { cookie: suspendedCookie } = await createSuspendedUserWithCookie("sospeso-route");
    const { cookie: activeCookie } = await createUserWithSession({ username: "attivo-route" });

    const suspended = await callRoute(sessionEnded, { url: "/api/auth/session-ended", cookie: suspendedCookie });
    const active = await callRoute(sessionEnded, { url: "/api/auth/session-ended", cookie: activeCookie });

    const suspendedLocation = new URL(suspended.headers.get("location") ?? "", "http://localhost:3000");
    const setCookie = suspended.headers.get("set-cookie") ?? "";
    expect(suspended.status).toBe(303);
    expect(suspendedLocation.pathname + suspendedLocation.search).toBe("/login?reason=session_ended");
    expect(setCookie).toMatch(/^kwb_session=;/);
    expect(setCookie).toMatch(/;\s*Max-Age=0(;|$)/);

    const activeLocation = new URL(active.headers.get("location") ?? "", "http://localhost:3000");
    expect([303, 307]).toContain(active.status);
    expect(activeLocation.pathname).toBe("/");
    expect(active.headers.get("set-cookie")).toBeNull();
  });
});
