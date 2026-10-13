// Gate di T-2404 (AC-2404-1): lo stato di un job attivo porta le ultime 20 keyword trovate, dalla più recente; un job
// terminato no.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
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

describe("anteprima dei suggerimenti nello stato del job", () => {
  // covers: AC-2404-1
  it("un job in autocomplete ha 20 recentSuggestions dalla più recente; un job completato non le ha", async () => {
    const owner = await createUserWithSession({ displayName: "t2404-job" });
    const project = await prisma.project.create({ data: { name: "P", workspace_id: owner.workspaceId } });
    const first = await prisma.subproject.create({ data: { project_id: project.id, name: "A", position: 0 } });
    const second = await prisma.subproject.create({ data: { project_id: project.id, name: "B", position: 1 } });
    const active = await prisma.job.create({
      data: { project_id: project.id, subproject_id: first.id, status: "running", phase: "autocomplete", heartbeat_at: new Date() },
    });
    const completed = await prisma.job.create({
      data: { project_id: project.id, subproject_id: second.id, status: "completed", phase: "done", completed_at: new Date() },
    });
    for (const job of [active, completed]) {
      // Una riga alla volta: l'id cresce nell'ordine in cui le keyword sono trovate.
      for (let index = 1; index <= 25; index += 1) {
        await prisma.jobSuggestion.create({
          data: { job_id: job.id, query_index: index, keyword: `scarpe ${String(index).padStart(2, "0")}`, source: "mock", source_query: "scarpe" },
        });
      }
    }
    const read = async (jobId: string) =>
      ((await (await callRoute(getJob, { url: `/api/jobs/${jobId}`, cookie: owner.cookie, params: { id: jobId } })).json()) as {
        data: Record<string, unknown>;
      }).data;

    const running = await read(active.id);
    const done = await read(completed.id);

    expect(running.recentSuggestions).toEqual(Array.from({ length: 20 }, (_, index) => `scarpe ${String(25 - index).padStart(2, "0")}`));
    expect(done).not.toHaveProperty("recentSuggestions");
  });
});
