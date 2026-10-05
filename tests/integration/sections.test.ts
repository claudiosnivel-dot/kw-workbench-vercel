// Gate di T-808 (AC-808-1…3): nome di sezione già usato -> 409 con codice stabile; riordino come scambio
// con la sezione adiacente (2 update); l'invariante «almeno una sezione» regge a due DELETE concorrenti.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteSection, PATCH as patchSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/route";
import { PATCH as reorderSections } from "@/app/api/projects/[id]/subprojects/reorder/route";
import { POST as createSection } from "@/app/api/projects/[id]/subprojects/route";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

async function createProjectWithSections(names: string[]) {
  const owner = await createUserWithSession({ username: `t808-${names.length}-${Date.now()}` });
  const project = await prisma.project.create({ data: { name: "Sezioni", owner_user_id: owner.user.id } });
  const sections = [];
  for (const [position, name] of names.entries()) {
    sections.push(await prisma.subproject.create({ data: { project_id: project.id, name, position } }));
  }
  return { cookie: owner.cookie, projectId: project.id, sectionIds: sections.map((section) => section.id) };
}

type TransactionCallback = (tx: Prisma.TransactionClient) => Promise<unknown>;

/** Conta le chiamate a tx.subproject.update dentro le transazioni interattive della richiesta. */
function countTransactionUpdates(): () => number {
  const realTransaction = prisma.$transaction.bind(prisma) as unknown as (
    fn: TransactionCallback,
    options?: unknown
  ) => Promise<unknown>;
  let calls = 0;
  vi.spyOn(prisma, "$transaction").mockImplementation(((fn: TransactionCallback, options?: unknown) =>
    realTransaction(async (tx) => {
      const update = vi.spyOn(tx.subproject, "update");
      try {
        return await fn(tx);
      } finally {
        calls += update.mock.calls.length;
        update.mockRestore();
      }
    }, options)) as never);
  return () => calls;
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nomi di sezione duplicati", () => {
  // covers: AC-808-1
  it("creazione e rinomina con un nome già usato ricevono 409 SECTION_NAME_TAKEN", async () => {
    const { cookie, projectId, sectionIds } = await createProjectWithSections(["Generale", "Blog"]);

    const created = await callRoute(createSection, {
      method: "POST",
      url: `/api/projects/${projectId}/subprojects`,
      cookie,
      params: { id: projectId },
      body: { name: "Generale", seeds: "" },
    });
    const renamed = await callRoute(patchSection, {
      method: "PATCH",
      url: `/api/projects/${projectId}/subprojects/${sectionIds[1]}`,
      cookie,
      params: { id: projectId, subprojectId: sectionIds[1] },
      body: { name: "Generale" },
    });

    const sections = await prisma.subproject.findMany({ where: { project_id: projectId }, select: { name: true } });
    expect(created.status).toBe(409);
    expect(((await created.json()) as { code: string }).code).toBe("SECTION_NAME_TAKEN");
    expect(renamed.status).toBe(409);
    expect(((await renamed.json()) as { code: string }).code).toBe("SECTION_NAME_TAKEN");
    expect(sections.map((section) => section.name).sort()).toEqual(["Blog", "Generale"]);
  });
});

describe("riordino delle sezioni", () => {
  // covers: AC-808-2
  it("spostare S3 in alto scambia S3 e S2 con 2 update", async () => {
    const { cookie, projectId, sectionIds } = await createProjectWithSections(["S1", "S2", "S3", "S4", "S5"]);
    const updates = countTransactionUpdates();

    const response = await callRoute(reorderSections, {
      method: "PATCH",
      url: `/api/projects/${projectId}/subprojects/reorder`,
      cookie,
      params: { id: projectId },
      body: { subprojectId: sectionIds[2], direction: "up" },
    });

    const ordered = await prisma.subproject.findMany({
      where: { project_id: projectId },
      orderBy: { position: "asc" },
      select: { name: true, position: true },
    });
    expect(response.status).toBe(200);
    expect(ordered.map((section) => section.name)).toEqual(["S1", "S3", "S2", "S4", "S5"]);
    expect(ordered.map((section) => section.position)).toEqual([0, 1, 2, 3, 4]);
    expect(updates()).toBe(2);
  });
});

describe("eliminazione dell'ultima sezione", () => {
  // covers: AC-808-3
  it("due DELETE concorrenti sulle uniche 2 sezioni: una 200, l'altra 400, resta 1 sezione", async () => {
    const { cookie, projectId, sectionIds } = await createProjectWithSections(["S1", "S2"]);

    const responses = await Promise.all(
      sectionIds.map((subprojectId) =>
        callRoute(deleteSection, {
          method: "DELETE",
          url: `/api/projects/${projectId}/subprojects/${subprojectId}`,
          cookie,
          params: { id: projectId, subprojectId },
        })
      )
    );

    const statuses = responses.map((response) => response.status).sort();
    const rejected = responses.find((response) => response.status === 400);
    expect(statuses).toEqual([200, 400]);
    expect(((await rejected!.json()) as { error: string }).error).toContain("ultima sezione");
    expect(await prisma.subproject.count({ where: { project_id: projectId } })).toBe(1);
  });
});
