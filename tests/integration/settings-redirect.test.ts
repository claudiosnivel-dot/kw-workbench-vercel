// Gate di T-2602 (AC-2602-3): la pagina delle impostazioni di una sezione non esiste più e il suo indirizzo risponde 308
// verso la pagina dell'argomento.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as subprojectRedirect } from "@/app/projects/[id]/subprojects/[subprojectId]/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("reindirizzamento delle impostazioni della sezione", () => {
  // covers: AC-2602-3
  it("/projects/<id>/subprojects/<A> risponde 308 verso /projects/<id>/keywords/<A>", async () => {
    const owner = await createUserWithSession({ displayName: `t2602-redirect-${randomUUID().slice(0, 8)}` });
    const project = await prisma.project.create({ data: { name: "P", workspace_id: owner.workspaceId } });
    const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "A", position: 0 } });

    const response = await callRoute(subprojectRedirect, {
      url: `/projects/${project.id}/subprojects/${topic.id}`,
      cookie: owner.cookie,
      params: { id: project.id, subprojectId: topic.id },
    });

    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location") ?? "", "http://localhost:3000").pathname).toBe(
      `/projects/${project.id}/keywords/${topic.id}`
    );
  });
});
