// Gate di T-2603 (AC-2603-2, AC-2603-3): la pagina Sezioni e la rotta della sezione predefinita non esistono più;
// default_subproject_id resta come ripiego e passa al primo argomento rimasto quando si elimina quello predefinito.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteTopic } from "@/app/api/projects/[id]/subprojects/[subprojectId]/route";
import { GET as sectionsRedirect } from "@/app/projects/[id]/sections/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { dispatch } from "../helpers/route-dispatch";

async function memberProject() {
  const owner = await createUserWithSession({ displayName: `t2603-${randomUUID().slice(0, 8)}` });
  const member = await createUserWithSession({ displayName: `t2603-mem-${randomUUID().slice(0, 8)}` });
  await prisma.membership.create({ data: { workspace_id: owner.workspaceId, user_id: member.user.id, role: "MEMBER" } });
  const project = await prisma.project.create({ data: { name: "P", workspace_id: owner.workspaceId } });
  const a = await prisma.subproject.create({ data: { project_id: project.id, name: "A", position: 0 } });
  const b = await prisma.subproject.create({ data: { project_id: project.id, name: "B", position: 1 } });
  await prisma.project.update({ where: { id: project.id }, data: { default_subproject_id: a.id } });
  return { member, projectId: project.id, a, b };
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

describe("fine delle pagine delle sezioni", () => {
  // covers: AC-2603-2
  it("/projects/<id>/sections risponde 308 verso le keyword del progetto e la rotta default-subproject 404", async () => {
    const { member, projectId } = await memberProject();

    const page = await callRoute(sectionsRedirect, { url: `/projects/${projectId}/sections`, cookie: member.cookie, params: { id: projectId } });

    expect(page.status).toBe(308);
    expect(new URL(page.headers.get("location") ?? "", "http://localhost:3000").pathname).toBe(`/projects/${projectId}/keywords`);
    expect(await dispatch("POST", `/api/projects/${projectId}/default-subproject`)).toBe(404);
  });

  // covers: AC-2603-3
  it("eliminando l'argomento predefinito A il ripiego passa a B", async () => {
    const { member, projectId, a, b } = await memberProject();

    const response = await callRoute(deleteTopic, {
      method: "DELETE",
      url: `/api/projects/${projectId}/subprojects/${a.id}`,
      cookie: member.cookie,
      params: { id: projectId, subprojectId: a.id },
    });

    expect(response.status).toBe(200);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).default_subproject_id).toBe(b.id);
  });
});
