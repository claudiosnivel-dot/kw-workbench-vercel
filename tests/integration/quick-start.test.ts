// Gate di T-2301 (AC-2301-1…4): l'avvio rapido crea progetto, primo argomento e parola di partenza nel workspace attivo
// e avvia la ricerca; lingua e paese dal progetto più recente o dalla lingua dell'interfaccia (D-39).
// Gate di T-3701 (AC-3701-1…3, D-44): fino a 5 voci separate da virgola, ognuna una parola di partenza dell'argomento.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as quickStart } from "@/app/api/projects/quick-start/route";
import { WORKSPACE_COOKIE_NAME } from "@/lib/authz/workspace";
import { setPlansForTesting } from "@/lib/billing/plans";
import { resetEnvForTests } from "@/lib/env";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { billingTeam } from "../helpers/billing-team";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { configureTestBilling } from "../helpers/paddle";

vi.mock("@/lib/modules/jobs/continuation", () => ({ scheduleJobContinuation: vi.fn() }));

type QuickStartBody = { data: { projectId: string; topicId: string; jobId: string | null; extraction: string } };

function postQuickStart(cookie: string | undefined, body: unknown, headers: Record<string, string> = {}) {
  return callRoute(quickStart, { method: "POST", url: "/api/projects/quick-start", body, cookie, headers });
}

/** Cookie di sessione con il workspace attivo scelto (T-1504). */
function inWorkspace(cookie: string, workspaceId: string): string {
  return `${cookie}; ${WORKSPACE_COOKIE_NAME}=${workspaceId}`;
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.mocked(scheduleJobContinuation).mockClear();
  await resetDatabase();
});

afterEach(() => {
  setPlansForTesting(null);
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("POST /api/projects/quick-start", () => {
  // covers: AC-2301-1
  it("in un workspace senza progetti crea progetto, argomento e seed in italiano e avvia la ricerca", async () => {
    const { member, workspaceId } = await billingTeam("qs1");

    const response = await postQuickStart(inWorkspace(member.cookie, workspaceId), { topic: "scarpe running" }, {
      "accept-language": "it-IT,it;q=0.9",
    });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as QuickStartBody;
    expect(data.extraction).toBe("started");
    expect(data.jobId).not.toBeNull();
    const project = await prisma.project.findUniqueOrThrow({ where: { id: data.projectId } });
    expect(project).toMatchObject({
      name: "Scarpe running",
      workspace_id: workspaceId,
      language_code: "it",
      country_code: "IT",
      created_via_onboarding: true,
      default_subproject_id: data.topicId,
    });
    const seeds = await prisma.seed.findMany({ where: { subproject_id: data.topicId }, select: { keyword: true } });
    expect(seeds).toEqual([{ keyword: "scarpe running" }]);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: data.jobId as string } });
    expect(job.subproject_id).toBe(data.topicId);
    expect(scheduleJobContinuation).toHaveBeenCalledWith(data.jobId);
  });

  // covers: AC-2301-2
  it("prende lingua e paese dal progetto più recente del workspace; lingua e paese del corpo vincono", async () => {
    const { user, cookie, workspaceId } = await createUserWithSession();
    await prisma.user.update({ where: { id: user.id }, data: { ui_locale: "en" } });
    await prisma.project.create({
      data: { name: "Vecchio", workspace_id: workspaceId, language_code: "fr", country_code: "FR", last_activity_at: new Date("2026-01-01") },
    });
    await prisma.project.create({ data: { name: "Recente", workspace_id: workspaceId, language_code: "es", country_code: "ES" } });

    const first = (await (await postQuickStart(cookie, { topic: "zapatillas" })).json()) as QuickStartBody;
    const second = (await (
      await postQuickStart(cookie, { topic: "shoes", languageCode: "en", countryCode: "GB" })
    ).json()) as QuickStartBody;

    const projects = await prisma.project.findMany({
      where: { id: { in: [first.data.projectId, second.data.projectId] } },
      select: { id: true, language_code: true, country_code: true, created_via_onboarding: true },
    });
    const byId = new Map(projects.map((project) => [project.id, project]));
    expect(byId.get(first.data.projectId)).toMatchObject({ language_code: "es", country_code: "ES", created_via_onboarding: false });
    expect(byId.get(second.data.projectId)).toMatchObject({ language_code: "en", country_code: "GB" });
  });

  it("senza progetti e con l'interfaccia in inglese usa en/US; una lingua non supportata è un 400", async () => {
    const { user, cookie } = await createUserWithSession();
    await prisma.user.update({ where: { id: user.id }, data: { ui_locale: "en" } });

    const created = (await (await postQuickStart(cookie, { topic: "running shoes" })).json()) as QuickStartBody;
    const invalid = await postQuickStart(cookie, { topic: "shoes", languageCode: "xx" });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: created.data.projectId } });
    expect(project).toMatchObject({ language_code: "en", country_code: "US" });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  // covers: AC-2301-3
  it("con l'email non verificata crea il progetto senza avviare la ricerca; un topic di 201 caratteri è un 400", async () => {
    const { cookie, workspaceId } = await createUserWithSession({ emailVerified: false });

    const created = await postQuickStart(cookie, { topic: "pizzeria milano" });
    const tooLong = await postQuickStart(cookie, { topic: "a".repeat(201) });

    expect(created.status).toBe(201);
    const { data } = (await created.json()) as QuickStartBody;
    expect(data).toMatchObject({ extraction: "EMAIL_NOT_VERIFIED", jobId: null });
    expect(await prisma.project.count({ where: { id: data.projectId } })).toBe(1);
    expect(await prisma.job.count({ where: { project_id: data.projectId } })).toBe(0);
    expect(tooLong.status).toBe(400);
    expect(((await tooLong.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
    expect(await prisma.project.count({ where: { workspace_id: workspaceId } })).toBe(1);
  });

  // covers: AC-2301-4
  it("l'anonimo riceve 401 e chi ha raggiunto il limite dei progetti con il lancio attivo riceve 402", async () => {
    await setCommercialLaunchForTests("live");
    configureTestBilling({ maxProjects: 1 });
    const { member, workspaceId } = await billingTeam("qs4");
    await prisma.project.create({ data: { name: "Esistente", workspace_id: workspaceId } });

    const anonymous = await postQuickStart(undefined, { topic: "yoga" });
    const limited = await postQuickStart(inWorkspace(member.cookie, workspaceId), { topic: "yoga" });

    expect(anonymous.status).toBe(401);
    expect(((await anonymous.json()) as { code: string }).code).toBe("AUTH_REQUIRED");
    expect(limited.status).toBe(402);
    expect(((await limited.json()) as { code: string }).code).toBe("PLAN_LIMIT");
    expect(await prisma.project.count({ where: { workspace_id: workspaceId } })).toBe(1);
  });
});

describe("POST /api/projects/quick-start con più voci (T-3701)", () => {
  // covers: AC-3701-1
  it("divide il topic sulle virgole: voci senza spazi ai lati, senza vuote e senza doppioni, nome dalla prima", async () => {
    const { member, workspaceId } = await billingTeam("qs3701a");

    const response = await postQuickStart(inWorkspace(member.cookie, workspaceId), {
      topic: "letto ospedaliero, Letto elettrico,  materasso antidecubito , letto ospedaliero",
    });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as QuickStartBody;
    expect(data.extraction).toBe("started");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: data.projectId }, select: { name: true } });
    expect(project.name).toBe("Letto ospedaliero");
    const seeds = await prisma.seed.findMany({
      where: { subproject_id: data.topicId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: { keyword: true },
    });
    expect(seeds.map((seed) => seed.keyword)).toEqual(["letto ospedaliero", "Letto elettrico", "materasso antidecubito"]);
  });

  // covers: AC-3701-2
  it("6 voci diverse o un topic fatto solo di virgole sono 400 VALIDATION_ERROR senza creare progetti", async () => {
    const { member, workspaceId } = await billingTeam("qs3701b");
    const cookie = inWorkspace(member.cookie, workspaceId);
    const before = await prisma.project.count();

    const tooMany = await postQuickStart(cookie, { topic: "uno, due, tre, quattro, cinque, sei" });
    const empty = await postQuickStart(cookie, { topic: " , , " });

    for (const response of [tooMany, empty]) {
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
    }
    expect(await prisma.project.count()).toBe(before);
  });

  // covers: AC-3701-3
  it("con il lancio attivo e maxSeedsPerSection 2, tre voci sono 402 PLAN_LIMIT senza creare progetti", async () => {
    await setCommercialLaunchForTests("live");
    configureTestBilling({ maxSeedsPerSection: 2 });
    const { member, workspaceId } = await billingTeam("qs3701c");
    const before = await prisma.project.count();

    const response = await postQuickStart(inWorkspace(member.cookie, workspaceId), { topic: "yoga, pilates, meditazione" });

    expect(response.status).toBe(402);
    expect(((await response.json()) as { code: string }).code).toBe("PLAN_LIMIT");
    expect(await prisma.project.count()).toBe(before);
  });
});
