// Gate di T-1502 (AC-1502-1…3): autorizzazione per workspace e ruolo su tutte le rotte di progetti, sezioni,
// risultati, export, job e onboarding. La matrice per attore calcola l'esito atteso dalla tabella dei permessi.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as cancelJob } from "@/app/api/jobs/[id]/cancel/route";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { POST as chooseOnboarding } from "@/app/api/onboarding/choice/route";
import { POST as resumeOnboarding } from "@/app/api/onboarding/resume/route";
import { POST as createOnboardingSection } from "@/app/api/onboarding/section/route";
import { POST as skipOnboarding } from "@/app/api/onboarding/skip/route";
import { GET as getOnboardingState, PATCH as patchOnboardingState } from "@/app/api/onboarding/state/route";
import { POST as createProject } from "@/app/api/projects/route";
import { DELETE as deleteProject, PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { PATCH as setDefaultSection } from "@/app/api/projects/[id]/default-subproject/route";
import { POST as exportToSheets } from "@/app/api/projects/[id]/export/google-sheets/route";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { GET as plannerExport } from "@/app/api/projects/[id]/planner-export/route";
import { POST as plannerImport } from "@/app/api/projects/[id]/planner-import/route";
import { PATCH as patchResults } from "@/app/api/projects/[id]/results/route";
import { POST as runProject } from "@/app/api/projects/[id]/run/route";
import { POST as runSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/run/route";
import { DELETE as deleteSection, PATCH as patchSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/route";
import { PATCH as reorderSections } from "@/app/api/projects/[id]/subprojects/reorder/route";
import { POST as createSection } from "@/app/api/projects/[id]/subprojects/route";
import { canPerform, type WorkspaceAction } from "@/lib/authz/permissions";
import type { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

// La continuazione dei job resta fuori dal test: l'avvio crea il job e risponde 202.
vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  scheduleJobContinuation: vi.fn(),
}));
vi.mocked(scheduleJobContinuation);

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

type Fixture = {
  workspaceId: string;
  projectId: string;
  sectionId: string;
  otherSectionId: string;
  keywordId: string;
  jobId: string;
  actors: Record<WorkspaceRole | "NON_MEMBER", Session>;
};

/** Workspace W con OWNER, ADMIN e MEMBER, progetto P con le sezioni S (predefinita) e S2, seed, keyword K e job J completato. */
async function createFixture(): Promise<Fixture> {
  const owner = await createUserWithSession({ displayName: "t1502-owner" });
  const admin = await createUserWithSession({ displayName: "t1502-admin" });
  const member = await createUserWithSession({ displayName: "t1502-member" });
  const outsider = await createUserWithSession({ displayName: "t1502-outsider" });
  const workspace = await prisma.workspace.create({ data: { name: "W", slug: "ws-t1502" } });
  await prisma.membership.createMany({
    data: [
      { workspace_id: workspace.id, user_id: owner.user.id, role: "OWNER" },
      { workspace_id: workspace.id, user_id: admin.user.id, role: "ADMIN" },
      { workspace_id: workspace.id, user_id: member.user.id, role: "MEMBER" },
    ],
  });
  const project = await prisma.project.create({
    data: {
      name: "P",
      workspace_id: workspace.id,
      created_by_user_id: owner.user.id,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "NONE",
    },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "S", position: 0 } });
  const otherSection = await prisma.subproject.create({ data: { project_id: project.id, name: "S2", position: 1 } });
  await prisma.project.update({ where: { id: project.id }, data: { default_subproject_id: section.id } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: "caffe moka" } });
  const keyword = await prisma.keywordCandidate.create({
    data: {
      project_id: project.id,
      subproject_id: section.id,
      keyword: "caffe moka prezzo",
      normalized_keyword: "caffe moka prezzo",
      canonical_keyword: "caffe moka prezzo",
      source: "MOCK",
      source_query: "caffe moka",
    },
  });
  const job = await prisma.job.create({
    data: { project_id: project.id, subproject_id: section.id, status: "completed", completed_at: new Date() },
  });
  return {
    workspaceId: workspace.id,
    projectId: project.id,
    sectionId: section.id,
    otherSectionId: otherSection.id,
    keywordId: keyword.id,
    jobId: job.id,
    actors: { OWNER: owner, ADMIN: admin, MEMBER: member, NON_MEMBER: outsider },
  };
}

/** Import di Keyword Planner: multipart con un file CSV minimo. */
function plannerImportRequest(fixture: Fixture, cookie: string) {
  const form = new FormData();
  form.set("file", new File(["Keyword,Avg. monthly searches\ncaffe moka prezzo,1000\n"], "planner.csv", { type: "text/csv" }));
  const request = new NextRequest(new URL(`/api/projects/${fixture.projectId}/planner-import`, "http://localhost:3000"), {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  return plannerImport(request, { params: Promise.resolve({ id: fixture.projectId }) });
}

type RouteCase = {
  name: string;
  action: WorkspaceAction;
  /** Code del 404 per chi non è membro: quello della risorsa (T-1303, T-1204). */
  notFoundCode: string;
  call: (fixture: Fixture, cookie: string) => Promise<Response>;
};

const ROUTES: RouteCase[] = [
  {
    name: "POST /api/projects (workspaceId)",
    action: "project.create",
    notFoundCode: "WORKSPACE_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(createProject, { method: "POST", url: "/api/projects", body: { name: "Nuovo", workspaceId: f.workspaceId }, cookie }),
  },
  {
    name: "PATCH /api/projects/[id]",
    action: "project.update",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(patchProject, { method: "PATCH", url: `/api/projects/${f.projectId}`, body: { name: "Rinominato" }, cookie, params: { id: f.projectId } }),
  },
  {
    name: "DELETE /api/projects/[id]",
    action: "project.delete",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) => callRoute(deleteProject, { method: "DELETE", url: `/api/projects/${f.projectId}`, cookie, params: { id: f.projectId } }),
  },
  {
    name: "PATCH /api/projects/[id]/default-subproject",
    action: "section.write",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(setDefaultSection, {
        method: "PATCH",
        url: `/api/projects/${f.projectId}/default-subproject`,
        body: { subprojectId: f.otherSectionId },
        cookie,
        params: { id: f.projectId },
      }),
  },
  {
    name: "GET /api/projects/[id]/export",
    action: "export.run",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(exportProject, { url: `/api/projects/${f.projectId}/export?format=json&scope=non-excluded`, cookie, params: { id: f.projectId } }),
  },
  {
    name: "POST /api/projects/[id]/export/google-sheets",
    action: "export.run",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(exportToSheets, {
        method: "POST",
        url: `/api/projects/${f.projectId}/export/google-sheets`,
        body: { fileName: "Export", scope: "non-excluded" },
        cookie,
        params: { id: f.projectId },
      }),
  },
  {
    name: "GET /api/projects/[id]/planner-export",
    action: "export.run",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) => callRoute(plannerExport, { url: `/api/projects/${f.projectId}/planner-export`, cookie, params: { id: f.projectId } }),
  },
  {
    name: "POST /api/projects/[id]/planner-import",
    action: "project.update",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) => plannerImportRequest(f, cookie),
  },
  {
    name: "PATCH /api/projects/[id]/results",
    action: "project.update",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(patchResults, {
        method: "PATCH",
        url: `/api/projects/${f.projectId}/results`,
        body: { action: "approve", ids: [f.keywordId] },
        cookie,
        params: { id: f.projectId },
      }),
  },
  {
    name: "POST /api/projects/[id]/run",
    action: "extraction.run",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(runProject, { method: "POST", url: `/api/projects/${f.projectId}/run`, body: { subprojectId: f.sectionId }, cookie, params: { id: f.projectId } }),
  },
  {
    name: "POST /api/projects/[id]/subprojects",
    action: "section.write",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(createSection, { method: "POST", url: `/api/projects/${f.projectId}/subprojects`, body: { name: "S3" }, cookie, params: { id: f.projectId } }),
  },
  {
    name: "PATCH /api/projects/[id]/subprojects/[subprojectId]",
    action: "section.write",
    notFoundCode: "SECTION_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(patchSection, {
        method: "PATCH",
        url: `/api/projects/${f.projectId}/subprojects/${f.sectionId}`,
        body: { name: "S rinominata" },
        cookie,
        params: { id: f.projectId, subprojectId: f.sectionId },
      }),
  },
  {
    name: "DELETE /api/projects/[id]/subprojects/[subprojectId]",
    action: "section.write",
    notFoundCode: "SECTION_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(deleteSection, {
        method: "DELETE",
        url: `/api/projects/${f.projectId}/subprojects/${f.otherSectionId}`,
        cookie,
        params: { id: f.projectId, subprojectId: f.otherSectionId },
      }),
  },
  {
    name: "POST /api/projects/[id]/subprojects/[subprojectId]/run",
    action: "extraction.run",
    notFoundCode: "SECTION_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(runSection, {
        method: "POST",
        url: `/api/projects/${f.projectId}/subprojects/${f.sectionId}/run`,
        cookie,
        params: { id: f.projectId, subprojectId: f.sectionId },
      }),
  },
  {
    name: "PATCH /api/projects/[id]/subprojects/reorder",
    action: "section.write",
    notFoundCode: "PROJECT_NOT_FOUND",
    call: (f, cookie) =>
      callRoute(reorderSections, {
        method: "PATCH",
        url: `/api/projects/${f.projectId}/subprojects/reorder`,
        body: { subprojectId: f.otherSectionId, direction: "up" },
        cookie,
        params: { id: f.projectId },
      }),
  },
  {
    name: "GET /api/jobs/[id]",
    action: "project.read",
    notFoundCode: "JOB_NOT_FOUND",
    call: (f, cookie) => callRoute(getJob, { url: `/api/jobs/${f.jobId}`, cookie, params: { id: f.jobId } }),
  },
  {
    name: "POST /api/jobs/[id]/cancel",
    action: "extraction.run",
    notFoundCode: "JOB_NOT_FOUND",
    call: (f, cookie) => callRoute(cancelJob, { method: "POST", url: `/api/jobs/${f.jobId}/cancel`, cookie, params: { id: f.jobId } }),
  },
  {
    name: "POST /api/onboarding/section (projectId)",
    action: "section.write",
    // Rotta del percorso guidato (T-1001): il 404 usa il code generico del modello d'errore di T-503.
    notFoundCode: "NOT_FOUND",
    call: (f, cookie) =>
      callRoute(createOnboardingSection, {
        method: "POST",
        url: "/api/onboarding/section",
        body: { projectId: f.projectId, name: "Onboarding", idempotencyKey: crypto.randomUUID() },
        cookie,
      }),
  },
];

const ACTORS = ["NON_MEMBER", "MEMBER", "ADMIN", "OWNER"] as const;

/** Righe di W (progetti, sezioni, seed, keyword, job) con tutti i campi, updated_at compreso. */
async function snapshotOfWorkspace(workspaceId: string) {
  const inWorkspace = { project: { workspace_id: workspaceId } };
  const byId = { orderBy: { id: "asc" as const } };
  return JSON.stringify(
    await Promise.all([
      prisma.project.findMany({ where: { workspace_id: workspaceId }, ...byId }),
      prisma.subproject.findMany({ where: inWorkspace, ...byId }),
      prisma.seed.findMany({ where: inWorkspace, ...byId }),
      prisma.keywordCandidate.findMany({ where: inWorkspace, ...byId }),
      prisma.job.findMany({ where: inWorkspace, ...byId }),
    ])
  );
}

async function codeOf(response: Response): Promise<string | undefined> {
  return ((await response.clone().json().catch(() => null)) as { code?: string } | null)?.code;
}

let fixture: Fixture;

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  await resetDatabase();
  fixture = await createFixture();
});

describe("matrice rotte × attori dalla tabella dei permessi", () => {
  describe.each(ROUTES)("$name", (route) => {
    it.each(ACTORS)("%s", async (actor) => {
      const response = await route.call(fixture, fixture.actors[actor].cookie);
      const code = await codeOf(response);

      if (actor === "NON_MEMBER") {
        expect([response.status, code]).toEqual([404, route.notFoundCode]);
      } else if (canPerform(actor, route.action)) {
        expect([401, 403, 404]).not.toContain(response.status);
      } else {
        expect([response.status, code]).toEqual([403, "FORBIDDEN"]);
      }
    });
  });
});

describe("chi non è membro", () => {
  // covers: AC-1502-1
  it("riceve 404 con il code della risorsa su ogni rotta e le righe di W non cambiano; l'onboarding ignora P", async () => {
    const outsider = fixture.actors.NON_MEMBER;
    const before = await snapshotOfWorkspace(fixture.workspaceId);

    for (const route of ROUTES) {
      const response = await route.call(fixture, outsider.cookie);
      expect([route.name, response.status, await codeOf(response)]).toEqual([route.name, 404, route.notFoundCode]);
    }

    // Progress dell'utente che punta a P (per esempio da un membership revocata): P non entra mai nello stato.
    await prisma.userOnboardingProgress.create({
      data: { user_id: outsider.user.id, status: "IN_PROGRESS", current_step: "SEEDS", active_project_id: fixture.projectId },
    });
    const onboarding = [
      await callRoute(getOnboardingState, { url: "/api/onboarding/state", cookie: outsider.cookie }),
      await callRoute(chooseOnboarding, { method: "POST", url: "/api/onboarding/choice", body: { mode: "resume" }, cookie: outsider.cookie }),
      await callRoute(resumeOnboarding, { method: "POST", url: "/api/onboarding/resume", cookie: outsider.cookie }),
      await callRoute(skipOnboarding, { method: "POST", url: "/api/onboarding/skip", cookie: outsider.cookie }),
    ];
    for (const response of onboarding) {
      expect(response.status).toBe(200);
      const { data } = (await response.json()) as { data: { activeProjectId: string | null } };
      expect(data.activeProjectId).not.toBe(fixture.projectId);
    }
    const patched = await callRoute(patchOnboardingState, {
      method: "PATCH",
      url: "/api/onboarding/state",
      body: { activeProjectId: fixture.projectId },
      cookie: outsider.cookie,
    });
    expect(patched.status).toBe(400);

    expect(await snapshotOfWorkspace(fixture.workspaceId)).toBe(before);
  });
});

describe("ruoli nel workspace", () => {
  // covers: AC-1502-2
  it("il MEMBER modifica, avvia ed esporta ma non elimina il progetto (403); l'ADMIN lo elimina", async () => {
    const { MEMBER: member, ADMIN: admin } = fixture.actors;
    const call = (name: string, session: Session) =>
      (ROUTES.find((route) => route.name === name) as RouteCase).call(fixture, session.cookie);

    const patched = await call("PATCH /api/projects/[id]", member);
    const started = await call("POST /api/projects/[id]/run", member);
    const exported = await call("GET /api/projects/[id]/export", member);
    const memberDelete = await call("DELETE /api/projects/[id]", member);

    expect(patched.status).toBe(200);
    expect(started.status).toBe(202);
    expect(exported.status).toBe(200);
    expect([memberDelete.status, await codeOf(memberDelete)]).toEqual([403, "FORBIDDEN"]);
    expect(await prisma.project.count({ where: { id: fixture.projectId } })).toBe(1);

    const adminDelete = await call("DELETE /api/projects/[id]", admin);
    expect(adminDelete.status).toBe(200);
    expect(await prisma.project.count({ where: { id: fixture.projectId } })).toBe(0);
  });
});

describe("id di un altro workspace", () => {
  // covers: AC-1502-3
  it("sezione, sezione predefinita e keyword di W2 non si toccano passando dal progetto di W1", async () => {
    const user = fixture.actors.OWNER;
    const other = await createUserWithSession({ displayName: "t1502-w2" });
    const p1 = await prisma.project.create({ data: { name: "P1", workspace_id: user.workspaceId } });
    const s1 = await prisma.subproject.create({ data: { project_id: p1.id, name: "S1", position: 0 } });
    await prisma.project.update({ where: { id: p1.id }, data: { default_subproject_id: s1.id } });
    const p2 = await prisma.project.create({ data: { name: "P2", workspace_id: other.workspaceId } });
    const s2 = await prisma.subproject.create({ data: { project_id: p2.id, name: "S2", position: 0 } });
    const k2 = await prisma.keywordCandidate.create({
      data: {
        project_id: p2.id,
        subproject_id: s2.id,
        keyword: "k2",
        normalized_keyword: "k2",
        canonical_keyword: "k2",
        source: "MOCK",
        source_query: "k2",
      },
    });

    const section = await callRoute(patchSection, {
      method: "PATCH",
      url: `/api/projects/${p1.id}/subprojects/${s2.id}`,
      body: { name: "presa" },
      cookie: user.cookie,
      params: { id: p1.id, subprojectId: s2.id },
    });
    const defaultSection = await callRoute(setDefaultSection, {
      method: "PATCH",
      url: `/api/projects/${p1.id}/default-subproject`,
      body: { subprojectId: s2.id },
      cookie: user.cookie,
      params: { id: p1.id },
    });
    const results = await callRoute(patchResults, {
      method: "PATCH",
      url: `/api/projects/${p1.id}/results`,
      body: { action: "approve", ids: [k2.id] },
      cookie: user.cookie,
      params: { id: p1.id },
    });

    expect(section.status).toBe(404);
    expect(defaultSection.status).toBe(404);
    expect(results.status).toBe(200);
    expect(await results.json()).toEqual({ success: true, updated: 0 });
    expect((await prisma.subproject.findUniqueOrThrow({ where: { id: s2.id } })).name).toBe("S2");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p1.id } })).default_subproject_id).toBe(s1.id);
    expect((await prisma.keywordCandidate.findUniqueOrThrow({ where: { id: k2.id } })).review_status).toBe("pending");
  });
});
