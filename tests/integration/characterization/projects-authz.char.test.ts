// Caratterizzazione di T-105: isolamento applicativo tra utenti (route-authz, D-02) su
// progetti, sezioni, risultati, export ed estrazione, più due invarianti di dominio.
// È la rete che protegge il passaggio ai workspace (T-1502).
// Oracolo di non regressione degli upgrade di 04-stack-upgrade (snapshot invariati):
// covers: AC-401-3
// covers: AC-403-4
// Oracolo di T-1102: il consolidamento dei duplicati non cambia il comportamento fotografato.
// covers: AC-1102-4
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createProject } from "@/app/api/projects/route";
import { DELETE as deleteProject, PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { PATCH as patchResults } from "@/app/api/projects/[id]/results/route";
import { POST as runProject } from "@/app/api/projects/[id]/run/route";
import { POST as createSection } from "@/app/api/projects/[id]/subprojects/route";
import { DELETE as deleteSection, PATCH as patchSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { callRoute } from "../../helpers/http";

type Fixture = {
  cookieA: string;
  cookieB: string;
  projectA: string;
  sectionA: string;
  candidatesB: string[];
};

async function createProjectWithCandidates(ownerId: string, name: string, seeds: string[], candidates: number) {
  const project = await prisma.project.create({ data: { name, workspace_id: await personalWorkspaceId(ownerId) } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.project.update({ where: { id: project.id }, data: { default_subproject_id: section.id } });
  await prisma.seed.createMany({
    data: seeds.map((keyword) => ({ project_id: project.id, subproject_id: section.id, keyword })),
  });
  await prisma.keywordCandidate.createMany({
    data: Array.from({ length: candidates }, (_, index) => {
      const keyword = `${name.toLowerCase()} keyword ${index + 1}`;
      return {
        project_id: project.id,
        subproject_id: section.id,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "MOCK",
        source_query: keyword,
      };
    }),
  });
  return { projectId: project.id, sectionId: section.id };
}

async function createFixture(): Promise<Fixture> {
  const a = await createUserWithSession({ displayName: "authz-a" });
  const b = await createUserWithSession({ displayName: "authz-b" });
  const projectA = await createProjectWithCandidates(a.user.id, "Progetto A", ["seed a1", "seed a2", "seed a3"], 5);
  const projectB = await createProjectWithCandidates(b.user.id, "Progetto B", [], 2);
  const candidatesB = await prisma.keywordCandidate.findMany({
    where: { project_id: projectB.projectId },
    select: { id: true },
  });

  return {
    cookieA: a.cookie,
    cookieB: b.cookie,
    projectA: projectA.projectId,
    sectionA: projectA.sectionId,
    candidatesB: candidatesB.map(({ id }) => id),
  };
}

/** Stato osservabile dei dati di A: nome del progetto, sezioni, seed e review_status. */
async function snapshotOfA(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  const sections = await prisma.subproject.count({ where: { project_id: projectId } });
  const seeds = await prisma.seed.findMany({ where: { project_id: projectId }, orderBy: { keyword: "asc" } });
  const candidates = await prisma.keywordCandidate.findMany({
    where: { project_id: projectId },
    orderBy: { keyword: "asc" },
  });
  return {
    name: project?.name ?? null,
    sections,
    seeds: seeds.map((seed) => seed.keyword),
    reviewStatus: candidates.map((candidate) => candidate.review_status),
  };
}

const UNCHANGED_A = {
  name: "Progetto A",
  sections: 1,
  seeds: ["seed a1", "seed a2", "seed a3"],
  reviewStatus: ["pending", "pending", "pending", "pending", "pending"],
};

let fixture: Fixture;

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
});

// impacted-by: T-1303 (i 404 passano da withApiErrors: code PROJECT_NOT_FOUND o SECTION_NOT_FOUND e requestId, T-503)
describe("caratterizzazione: isolamento dei progetti", () => {
  // covers: AC-105-1
  // impacted-by: T-1101 (GET di progetto, sezione ed elenco delle sezioni rimossi: senza chiamanti)
  it("B riceve 404 su PATCH e DELETE del progetto di A, che resta invariato", async () => {
    const { cookieB, projectA } = fixture;
    const url = `/api/projects/${projectA}`;
    const params = { id: projectA };

    for (const [handler, method, body] of [
      [patchProject, "PATCH", { name: "Rinominato da B" }],
      [deleteProject, "DELETE", undefined],
    ] as const) {
      const response = await callRoute(handler, { method, url, body, cookie: cookieB, params });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Progetto non trovato", code: "PROJECT_NOT_FOUND", requestId: expect.any(String) });
      expect(await snapshotOfA(projectA)).toEqual(UNCHANGED_A);
    }
  });
});

describe("caratterizzazione: isolamento di sezioni, export ed estrazione", () => {
  // covers: AC-105-2
  it("B riceve 404 sulle rotte di sezione, sull'export e sul run, e non crea job", async () => {
    const { cookieB, projectA, sectionA } = fixture;
    const sectionUrl = `/api/projects/${projectA}/subprojects/${sectionA}`;
    const sectionParams = { id: projectA, subprojectId: sectionA };

    for (const [handler, method, body] of [
      [patchSection, "PATCH", { name: "Sezione di B", seeds: ["seed di b"] }],
      [deleteSection, "DELETE", undefined],
    ] as const) {
      const response = await callRoute(handler, { method, url: sectionUrl, body, cookie: cookieB, params: sectionParams });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Sezione non trovata", code: "SECTION_NOT_FOUND", requestId: expect.any(String) });
      expect(await snapshotOfA(projectA)).toEqual(UNCHANGED_A);
    }

    const exported = await callRoute(exportProject, {
      url: `/api/projects/${projectA}/export?format=json&scope=non-excluded`,
      cookie: cookieB,
      params: { id: projectA },
    });
    expect(exported.status).toBe(404);
    expect(await exported.json()).toEqual({ error: "Progetto non trovato", code: "PROJECT_NOT_FOUND", requestId: expect.any(String) });

    const run = await callRoute(runProject, {
      method: "POST",
      url: `/api/projects/${projectA}/run`,
      body: { subprojectId: sectionA },
      cookie: cookieB,
      params: { id: projectA },
    });
    expect(run.status).toBe(404);
    expect(await run.json()).toEqual({ error: "Progetto non trovato", code: "PROJECT_NOT_FOUND", requestId: expect.any(String) });
    expect(await prisma.job.count({ where: { project_id: projectA } })).toBe(0);
    expect(await snapshotOfA(projectA)).toEqual(UNCHANGED_A);
  });

  it("B riceve 404 sulla creazione delle sezioni del progetto di A", async () => {
    const { cookieB, projectA } = fixture;
    const url = `/api/projects/${projectA}/subprojects`;

    for (const [handler, method, body] of [
      [createSection, "POST", { name: "Sezione di B" }],
    ] as const) {
      const response = await callRoute(handler, { method, url, body, cookie: cookieB, params: { id: projectA } });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Progetto non trovato", code: "PROJECT_NOT_FOUND", requestId: expect.any(String) });
      expect(await snapshotOfA(projectA)).toEqual(UNCHANGED_A);
    }
  });
});

describe("caratterizzazione: azioni sui risultati", () => {
  // covers: AC-105-3
  it("la PATCH di A con id di candidate di B risponde 200 e non modifica righe", async () => {
    const { cookieA, projectA, candidatesB } = fixture;

    const response = await callRoute(patchResults, {
      method: "PATCH",
      url: `/api/projects/${projectA}/results`,
      body: { action: "approve", ids: candidatesB },
      cookie: cookieA,
      params: { id: projectA },
    });

    expect(response.status).toBe(200);
    // impacted-by: T-803 (la risposta dichiara le righe aggiornate: 0 fuori dal progetto di A)
    expect(await response.json()).toEqual({ success: true, updated: 0 });
    const rows = await prisma.keywordCandidate.findMany({ where: { id: { in: candidatesB } } });
    expect(rows.map((row) => row.review_status)).toEqual(["pending", "pending"]);
  });
});

describe("caratterizzazione: invarianti di dominio", () => {
  // covers: AC-105-4
  it("la creazione crea la sezione Generale predefinita e l'ultima sezione non si elimina", async () => {
    const { cookieA } = fixture;

    const created = await callRoute(createProject, {
      method: "POST",
      url: "/api/projects",
      body: { name: "Nuovo progetto di A" },
      cookie: cookieA,
    });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { project: { id: string }; initial_subproject_id: string | null } };
    expect(data.initial_subproject_id).not.toBeNull();

    const project = await prisma.project.findUniqueOrThrow({ where: { id: data.project.id } });
    const sections = await prisma.subproject.findMany({ where: { project_id: data.project.id } });
    expect(sections.map((section) => [section.name, section.position])).toEqual([["Generale", 0]]);
    expect(project.default_subproject_id).toBe(data.initial_subproject_id);

    const sectionId = data.initial_subproject_id as string;
    const deleted = await callRoute(deleteSection, {
      method: "DELETE",
      url: `/api/projects/${data.project.id}/subprojects/${sectionId}`,
      cookie: cookieA,
      params: { id: data.project.id, subprojectId: sectionId },
    });
    expect(deleted.status).toBe(400);
    expect(((await deleted.json()) as { error: string }).error.startsWith("Non puoi eliminare l'ultima sezione")).toBe(
      true
    );
    expect(await prisma.subproject.count({ where: { id: sectionId } })).toBe(1);
  });
});
