// Gate di T-1003 (AC-1003-1…3): il server verifica le precondizioni dei passi (seed, job completato), il client
// non può dichiarare COMPLETED e il completamento arriva solo da un export non vuoto del progetto attivo.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { PATCH as patchOnboardingState } from "@/app/api/onboarding/state/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const auth = vi.hoisted(() => ({ user: null as unknown }));

vi.mock("@/lib/auth/page-guard", () => ({ requirePageUser: async () => auth.user }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

/** Utente con onboarding IN_PROGRESS su un progetto attivo con una sezione attiva. */
async function createActiveSection(username: string, currentStep: "SEEDS" | "REVIEW_EXPORT") {
  const session = await createUserWithSession({ displayName: username });
  const project = await prisma.project.create({ data: { name: "Blog", workspace_id: await personalWorkspaceId(session.user.id) } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.userOnboardingProgress.create({
    data: {
      user_id: session.user.id,
      status: "IN_PROGRESS",
      current_step: currentStep,
      entry_mode: "RESUME",
      active_project_id: project.id,
      active_subproject_id: section.id,
    },
  });
  auth.user = { id: session.user.id, displayName: session.user.display_name, role: session.user.role, isRootAdmin: false };
  return { ...session, projectId: project.id, sectionId: section.id };
}

async function insertKeyword(projectId: string, sectionId: string, keyword: string) {
  await prisma.keywordCandidate.create({
    data: {
      project_id: projectId,
      subproject_id: sectionId,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "seed",
      source_query: keyword,
    },
  });
}

function patchState(cookie: string, body: unknown) {
  return callRoute(patchOnboardingState, { method: "PATCH", url: "/api/onboarding/state", cookie, body });
}

function exportCsv(cookie: string, projectId: string, scope: string) {
  return callRoute(exportProject, {
    url: `/api/projects/${projectId}/export?format=csv&scope=${scope}`,
    cookie,
    params: { id: projectId },
  });
}

async function progressOf(userId: string) {
  return prisma.userOnboardingProgress.findUniqueOrThrow({ where: { user_id: userId } });
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("precondizioni dei passi", () => {
  // covers: AC-1003-1
  it("RUN senza seed riceve 409 ONBOARDING_PRECONDITION; review-export con soli job falliti reindirizza al run", async () => {
    const empty = await createActiveSection("t1003-no-seeds", "SEEDS");

    const patch = await patchState(empty.cookie, { currentStep: "RUN" });
    const patchBody = await patch.json();

    expect(patch.status).toBe(409);
    expect(patchBody.code).toBe("ONBOARDING_PRECONDITION");
    expect(patchBody.missing).toBe("seeds");
    expect((await progressOf(empty.user.id)).current_step).toBe("SEEDS");

    const failed = await createActiveSection("t1003-failed-job", "REVIEW_EXPORT");
    await prisma.seed.create({ data: { project_id: failed.projectId, subproject_id: failed.sectionId, keyword: "scarpe" } });
    await prisma.job.create({ data: { project_id: failed.projectId, subproject_id: failed.sectionId, status: "failed" } });
    const { default: ReviewExportPage } = await import("@/app/onboarding/review-export/page");

    await expect(ReviewExportPage()).rejects.toThrow("redirect /onboarding/run");
  });

  it("RUN con almeno una seed avanza; REVIEW_EXPORT senza job completato riceve 409 con missing job", async () => {
    const { user, cookie, projectId, sectionId } = await createActiveSection("t1003-seeds", "SEEDS");
    await prisma.seed.create({ data: { project_id: projectId, subproject_id: sectionId, keyword: "scarpe" } });

    const run = await patchState(cookie, { currentStep: "RUN" });
    const review = await patchState(cookie, { currentStep: "REVIEW_EXPORT" });
    const reviewBody = await review.json();

    expect(run.status).toBe(200);
    expect(review.status).toBe(409);
    expect(reviewBody.missing).toBe("job");
    expect((await progressOf(user.id)).current_step).toBe("RUN");
  });
});

describe("completamento", () => {
  // covers: AC-1003-2
  it("PATCH con status COMPLETED riceve 400 ONBOARDING_STATUS_FORBIDDEN e lo stato non cambia", async () => {
    const { user, cookie } = await createActiveSection("t1003-forbidden", "SEEDS");

    const response = await patchState(cookie, { status: "COMPLETED" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("ONBOARDING_STATUS_FORBIDDEN");
    const progress = await progressOf(user.id);
    expect(progress.status).toBe("IN_PROGRESS");
    expect(progress.completed_at).toBeNull();
  });

  // R20 di T-1101: la modalità d'ingresso non si modifica dal PATCH dello stato.
  it("PATCH con entryMode riceve 400 ONBOARDING_ENTRY_MODE_FORBIDDEN e lo stato non cambia", async () => {
    const { user, cookie } = await createActiveSection("t1101-entry-mode", "SEEDS");
    const before = await progressOf(user.id);

    const response = await patchState(cookie, { entryMode: "RESTART", currentStep: "PROJECT_CREATE" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("ONBOARDING_ENTRY_MODE_FORBIDDEN");
    expect(await progressOf(user.id)).toEqual(before);
  });

  // covers: AC-1003-3
  it("solo un export non vuoto del progetto attivo completa l'onboarding", async () => {
    const { user, cookie, projectId, sectionId } = await createActiveSection("t1003-export", "REVIEW_EXPORT");
    await insertKeyword(projectId, sectionId, "scarpe running");
    const other = await prisma.project.create({ data: { name: "Altro", workspace_id: await personalWorkspaceId(user.id) } });
    const otherSection = await prisma.subproject.create({ data: { project_id: other.id, name: "Generale", position: 0 } });
    await insertKeyword(other.id, otherSection.id, "scarpe trail");

    const otherExport = await exportCsv(cookie, other.id, "non-excluded");
    await otherExport.arrayBuffer();
    const afterOther = await progressOf(user.id);
    // Nessuna keyword approvata: lo scope approved del progetto attivo è vuoto.
    const emptyExport = await exportCsv(cookie, projectId, "approved");
    await emptyExport.arrayBuffer();
    const afterEmpty = await progressOf(user.id);
    const activeExport = await exportCsv(cookie, projectId, "non-excluded");
    await activeExport.arrayBuffer();
    const afterActive = await progressOf(user.id);

    expect([otherExport.status, emptyExport.status, activeExport.status]).toEqual([200, 200, 200]);
    expect(afterOther.status).not.toBe("COMPLETED");
    expect(afterEmpty.status).not.toBe("COMPLETED");
    expect(afterActive.status).toBe("COMPLETED");
    expect(afterActive.completed_at).not.toBeNull();
  });
});
