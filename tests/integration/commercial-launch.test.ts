// Gate di T-1606 (AC-1606-1…4): interruttore del lancio commerciale con checklist, pausa come stato di default.
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@/lib/generated/prisma/enums";
import { GET as getLaunch, PATCH as patchLaunch } from "@/app/api/admin/launch/route";
import { POST as createAdminUser } from "@/app/api/admin/users/route";
import { POST as register } from "@/app/api/auth/register/route";
import { getEntitlements } from "@/lib/billing/entitlements";
import { getLaunchStatus } from "@/lib/billing/launch";
import { setPlansForTesting } from "@/lib/billing/plans";
import { resetEnvForTests } from "@/lib/env";
import { areLegalTextsPublished } from "@/lib/legal/documents";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { configureTestBilling, fakePaddleValue, TEST_FREE_LIMITS } from "../helpers/paddle";

// La voce legal controlla i file di T-1803, oggi segnaposto (mancante): il test la simula pronta solo in AC-1606-4
// (configurazione di test della checklist completa). impacted-by: T-1702 (la voce captcha è costruita: in AC-1606-4
// chiavi di prova), T-1803 (il controllo vive in lib/legal/documents.ts e negli altri test gira davvero).
vi.mock("@/lib/legal/documents", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/legal/documents")>();
  return { ...original, areLegalTextsPublished: vi.fn(original.areLegalTextsPublished) };
});

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  setPlansForTesting(null);
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("lancio commerciale in pausa", () => {
  // covers: AC-1606-1
  it("senza stato salvato il lancio è in pausa e i diritti sono illimitati", async () => {
    const { workspaceId } = await createUserWithSession({ displayName: "t1606-owner" });

    expect(await getLaunchStatus()).toBe("paused");
    const { limits } = await getEntitlements(workspaceId);
    expect(limits).toMatchObject({
      maxProjects: null,
      maxSectionsPerProject: null,
      maxSeedsPerSection: null,
      runsPerDay: null,
      maxKeywordsPerRun: null,
      keywordsPerMonth: null,
      licensedMetricsKeywordsPerMonth: null,
      seats: null,
      sheetsExport: true,
      plannerImport: true,
    });
  });

  // covers: AC-1606-2
  it("la registrazione pubblica è chiusa e l'utente creato dal root admin nasce verificato", async () => {
    vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
    const root = await createUserWithSession({ displayName: "t1606-root", role: UserRole.ADMIN, isRootAdmin: true });
    const credentials = { password: "una-password-lunga-1", confirmPassword: "una-password-lunga-1" };

    const registration = await callRoute(register, {
      method: "POST",
      url: "/api/auth/register",
      body: { email: "pubblico@example.test", ...credentials, acceptTerms: true, termsVersion: LEGAL_TERMS_VERSION },
    });
    const created = await callRoute(createAdminUser, {
      method: "POST",
      url: "/api/admin/users",
      body: { email: "creato@example.test", ...credentials },
      cookie: root.cookie,
    });

    expect([registration.status, ((await registration.json()) as { code: string }).code]).toEqual([403, "SIGNUP_DISABLED"]);
    expect(await prisma.user.count({ where: { email: "pubblico@example.test" } })).toBe(0);
    expect(created.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "creato@example.test" } });
    expect(user.email_verified_at).not.toBeNull();
  });

  // covers: AC-1606-3
  it("con i piani segnaposto l'attivazione risponde 409 LAUNCH_NOT_READY; un admin non root riceve 403", async () => {
    const root = await createUserWithSession({ displayName: "t1606-root", role: UserRole.ADMIN, isRootAdmin: true });
    const admin = await createUserWithSession({ displayName: "t1606-admin", role: UserRole.ADMIN });
    const activate = (cookie: string) =>
      callRoute(patchLaunch, { method: "PATCH", url: "/api/admin/launch", body: { status: "live" }, cookie });

    const byRoot = await activate(root.cookie);
    const byAdmin = await activate(admin.cookie);

    const rootBody = (await byRoot.json()) as { code: string; missing: string[] };
    expect(byRoot.status).toBe(409);
    expect(rootBody.code).toBe("LAUNCH_NOT_READY");
    expect(rootBody.missing).toContain("plans");
    expect([byAdmin.status, ((await byAdmin.json()) as { code: string }).code]).toEqual([403, "FORBIDDEN"]);
    expect(await getLaunchStatus()).toBe("paused");
  });
});

describe("lancio commerciale attivo", () => {
  // covers: AC-1606-4
  it("con la checklist completa il root admin attiva il lancio e lo rimette in pausa", async () => {
    configureTestBilling();
    vi.stubEnv("RESEND_API_KEY", fakePaddleValue("re_"));
    vi.stubEnv("EMAIL_FROM", "noreply@example.test");
    vi.mocked(areLegalTextsPublished).mockReturnValue(true);
    vi.stubEnv("TURNSTILE_SECRET_KEY", fakePaddleValue("0x4AAAA"));
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", fakePaddleValue("0x4AAAA"));
    const root = await createUserWithSession({ displayName: "t1606-root", role: UserRole.ADMIN, isRootAdmin: true });
    const owner = await createUserWithSession({ displayName: "t1606-owner" });
    const change = (status: string) =>
      callRoute(patchLaunch, { method: "PATCH", url: "/api/admin/launch", body: { status }, cookie: root.cookie });

    expect((await change("live")).status).toBe(200);
    const live = (await (await callRoute(getLaunch, { url: "/api/admin/launch", cookie: root.cookie })).json()) as {
      data: { status: string; checklist: { id: string; ok: boolean }[]; changedBy: string };
    };
    expect(live.data.status).toBe("live");
    expect(live.data.checklist.every((item) => item.ok)).toBe(true);
    expect(live.data.changedBy).toBe("t1606-root@example.test");
    expect((await getEntitlements(owner.workspaceId)).limits).toEqual(TEST_FREE_LIMITS);

    expect((await change("paused")).status).toBe(200);
    expect(await getLaunchStatus()).toBe("paused");
    expect((await getEntitlements(owner.workspaceId)).limits.maxProjects).toBeNull();
  });

  it("la checklist non contiene i valori delle variabili e un body non valido è un 400", async () => {
    const secret = fakePaddleValue("pdl_sdbx_apikey_");
    vi.stubEnv("PADDLE_ENV", "sandbox");
    vi.stubEnv("PADDLE_API_KEY", secret);
    const root = await createUserWithSession({ displayName: "t1606-root", role: UserRole.ADMIN, isRootAdmin: true });

    const read = await callRoute(getLaunch, { url: "/api/admin/launch", cookie: root.cookie });
    const invalid = await callRoute(patchLaunch, { method: "PATCH", url: "/api/admin/launch", body: { status: "on" }, cookie: root.cookie });

    expect(await read.text()).not.toContain(secret);
    expect(invalid.status).toBe(400);
  });
});
