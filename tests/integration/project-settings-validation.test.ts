// Gate di T-809 (AC-809-1…4): le PATCH di progetto e sezione aggiornano solo i campi inviati, gli input
// fuori dai limiti sono rifiutati con 400 VALIDATION_ERROR e il campo coinvolto, il provider MOCK è del
// solo root admin e i campi non dichiarati non arrivano a Prisma.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { PATCH as patchSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/route";
import { UserRole } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

async function createFixture(options: { isRootAdmin?: boolean; username: string }) {
  const owner = await createUserWithSession({
    username: options.username,
    isRootAdmin: options.isRootAdmin,
    role: options.isRootAdmin ? UserRole.ADMIN : UserRole.SUBSCRIBER,
  });
  const project = await prisma.project.create({
    data: {
      name: "Progetto",
      owner_user_id: owner.user.id,
      metrics_provider: "NONE",
      min_volume: 500,
      exclude_brands: false,
      expand_alpha: false,
    },
  });
  const section = await prisma.subproject.create({
    data: { project_id: project.id, name: "Generale", position: 0, language_code_override: "it" },
  });
  await prisma.seed.createMany({
    data: Array.from({ length: 12 }, (_, index) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword: `seed ${index}`,
    })),
  });
  return { owner, projectId: project.id, sectionId: section.id };
}

function patchProjectAs(cookie: string, projectId: string, body: unknown) {
  return callRoute(patchProject, {
    method: "PATCH",
    url: `/api/projects/${projectId}`,
    cookie,
    params: { id: projectId },
    body,
  });
}

function patchSectionAs(cookie: string, projectId: string, sectionId: string, body: unknown) {
  return callRoute(patchSection, {
    method: "PATCH",
    url: `/api/projects/${projectId}/subprojects/${sectionId}`,
    cookie,
    params: { id: projectId, subprojectId: sectionId },
    body,
  });
}

async function snapshot(projectId: string, sectionId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const section = await prisma.subproject.findUniqueOrThrow({ where: { id: sectionId } });
  const seeds = await prisma.seed.count({ where: { subproject_id: sectionId } });
  const { updated_at: projectUpdatedAt, ...projectValues } = project;
  const { updated_at: sectionUpdatedAt, ...sectionValues } = section;
  void projectUpdatedAt;
  void sectionUpdatedAt;
  return { projectValues, sectionValues, seeds };
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

describe("aggiornamenti parziali", () => {
  // covers: AC-809-1
  it("i campi assenti restano invariati; seeds vuoto cancella le seed", async () => {
    const { owner, projectId, sectionId } = await createFixture({ username: "t809-partial" });

    const renamed = await patchProjectAs(owner.cookie, projectId, { name: "Nuovo nome" });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const described = await patchSectionAs(owner.cookie, projectId, sectionId, { description: "note" });
    const seedsAfterDescription = await prisma.seed.count({ where: { subproject_id: sectionId } });
    const emptied = await patchSectionAs(owner.cookie, projectId, sectionId, { seeds: "" });
    const seedsAfterEmpty = await prisma.seed.count({ where: { subproject_id: sectionId } });

    expect([renamed.status, described.status, emptied.status]).toEqual([200, 200, 200]);
    expect(project).toMatchObject({ name: "Nuovo nome", min_volume: 500, exclude_brands: false, expand_alpha: false });
    expect(seedsAfterDescription).toBe(12);
    expect(seedsAfterEmpty).toBe(0);
  });
});

describe("validazione dei limiti", () => {
  // covers: AC-809-2
  it("ogni valore fuori dai limiti riceve 400 VALIDATION_ERROR con il campo e il DB resta invariato", async () => {
    const { owner, projectId, sectionId } = await createFixture({ username: "t809-limits" });
    const before = await snapshot(projectId, sectionId);
    const requests: [string, () => Promise<Response>][] = [
      ["min_volume", () => patchProjectAs(owner.cookie, projectId, { min_volume: 2147483648 })],
      ["exclude_brands", () => patchProjectAs(owner.cookie, projectId, { exclude_brands: "n" })],
      [
        "language_code_override",
        () => patchSectionAs(owner.cookie, projectId, sectionId, { language_code_override: "xx" }),
      ],
      ["name", () => patchProjectAs(owner.cookie, projectId, { name: "x".repeat(121) })],
      [
        "seeds",
        () =>
          patchSectionAs(owner.cookie, projectId, sectionId, {
            seeds: Array.from({ length: 501 }, (_, index) => `seed nuova ${index}`).join("\n"),
          }),
      ],
      ["scoring_profile", () => patchProjectAs(owner.cookie, projectId, { scoring_profile: "turbo" })],
    ];

    for (const [field, send] of requests) {
      const response = await send();
      const body = (await response.json()) as { code: string; error: string };
      expect(response.status, field).toBe(400);
      expect(body.code, field).toBe("VALIDATION_ERROR");
      expect(body.error, field).toContain(field);
    }
    expect(await snapshot(projectId, sectionId)).toEqual(before);
  });
});

describe("provider di metriche MOCK", () => {
  // covers: AC-809-3
  it("riservato al root admin: 403 FORBIDDEN_FIELD per gli altri, 200 per il root admin", async () => {
    const user = await createFixture({ username: "t809-user" });
    const root = await createFixture({ username: "t809-root", isRootAdmin: true });

    const denied = await patchProjectAs(user.owner.cookie, user.projectId, { metrics_provider: "MOCK" });
    const allowed = await patchProjectAs(root.owner.cookie, root.projectId, { metrics_provider: "MOCK" });

    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe("FORBIDDEN_FIELD");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: user.projectId } })).metrics_provider).toBe("NONE");
    expect(allowed.status).toBe(200);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: root.projectId } })).metrics_provider).toBe("MOCK");
  });
});

describe("campi non dichiarati e override vuoti", () => {
  // covers: AC-809-4
  it("owner_user_id è rifiutato con 400; language_code_override vuoto torna a null", async () => {
    const { owner, projectId, sectionId } = await createFixture({ username: "t809-strict" });
    const intruder = await createUserWithSession({ username: "t809-other" });

    const rejected = await patchProjectAs(owner.cookie, projectId, { owner_user_id: intruder.user.id });
    const inherited = await patchSectionAs(owner.cookie, projectId, sectionId, { language_code_override: "" });

    expect(rejected.status).toBe(400);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).owner_user_id).toBe(owner.user.id);
    expect(inherited.status).toBe(200);
    expect((await prisma.subproject.findUniqueOrThrow({ where: { id: sectionId } })).language_code_override).toBeNull();
  });
});
