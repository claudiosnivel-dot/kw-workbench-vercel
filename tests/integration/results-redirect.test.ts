// Gate di T-2403 (AC-2403-4): i vecchi indirizzi della pagina dei risultati rispondono 308 verso la pagina delle keyword,
// con i filtri con lo stesso nome.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as resultsRedirect } from "@/app/projects/[id]/results/route";
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

describe("reindirizzamento dei risultati", () => {
  // covers: AC-2403-4
  it("subprojectId porta all'argomento con i filtri, view=all alla vista del progetto, entrambi con 308", async () => {
    const owner = await createUserWithSession({ displayName: "t2403-redirect" });
    const project = await prisma.project.create({ data: { name: "P", workspace_id: owner.workspaceId } });
    const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "A", position: 0 } });
    const follow = (query: string) =>
      callRoute(resultsRedirect, { url: `/projects/${project.id}/results?${query}`, cookie: owner.cookie, params: { id: project.id } });

    const topicResponse = await follow(`subprojectId=${topic.id}&searchText=scarpe`);
    const projectResponse = await follow("view=all");
    const target = (response: Response) => {
      const location = new URL(response.headers.get("location") ?? "", "http://localhost:3000");
      return `${location.pathname}${location.search}`;
    };

    expect(topicResponse.status).toBe(308);
    expect(target(topicResponse)).toBe(`/projects/${project.id}/keywords/${topic.id}?searchText=scarpe`);
    expect(projectResponse.status).toBe(308);
    expect(target(projectResponse)).toBe(`/projects/${project.id}/keywords`);
  });
});
