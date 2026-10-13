// Gate di T-2405 (AC-2405-3): l'opzione automatica di «Aggiungi i volumi» imposta DATAFORSEO sull'argomento e rilancia
// la ricerca (le due richieste del dialogo), senza toccare le scelte tieni/scarta. La continuazione del job è sostituita
// da un registratore: il job resta attivo.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as runTopic } from "@/app/api/projects/[id]/subprojects/[subprojectId]/run/route";
import { PATCH as patchTopic } from "@/app/api/projects/[id]/subprojects/[subprojectId]/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  scheduleJobContinuation: vi.fn(),
}));

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("Aggiungi i volumi, opzione automatica", () => {
  // covers: AC-2405-3
  it("il root admin imposta DATAFORSEO sull'argomento, un job nuovo è attivo e tieni/scarta non cambiano", async () => {
    const admin = await createUserWithSession({ displayName: "t2405-root", isRootAdmin: true, role: "ADMIN" });
    const project = await prisma.project.create({ data: { name: "P", workspace_id: admin.workspaceId, language_code: "it", country_code: "IT" } });
    const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "Scarpe", position: 0 } });
    await prisma.seed.create({ data: { project_id: project.id, subproject_id: topic.id, keyword: "scarpe" } });
    await prisma.keywordCandidate.createMany({
      data: (["pending", "approved", "rejected"] as const).map((review_status, index) => ({
        project_id: project.id,
        subproject_id: topic.id,
        keyword: `scarpe ${index}`,
        normalized_keyword: `scarpe ${index}`,
        canonical_keyword: `scarpe ${index}`,
        source: "seed",
        source_query: "scarpe",
        review_status,
      })),
    });
    const params = { id: project.id, subprojectId: topic.id };
    const topicUrl = `/api/projects/${project.id}/subprojects/${topic.id}`;
    const reviews = async () =>
      (await prisma.keywordCandidate.findMany({ where: { subproject_id: topic.id }, orderBy: { keyword: "asc" } })).map(
        (row) => row.review_status
      );
    const before = await reviews();

    const patched = await callRoute(patchTopic, {
      method: "PATCH",
      url: topicUrl,
      cookie: admin.cookie,
      params,
      body: { metrics_provider_override: "DATAFORSEO" },
    });
    const run = await callRoute(runTopic, { method: "POST", url: `${topicUrl}/run`, cookie: admin.cookie, params });

    expect(patched.status).toBe(200);
    expect(run.status).toBe(202);
    const stored = await prisma.subproject.findUniqueOrThrow({ where: { id: topic.id } });
    expect(stored.metrics_provider_override).toBe("DATAFORSEO");
    const jobs = await prisma.job.findMany({ where: { subproject_id: topic.id, status: { in: ["pending", "running"] } } });
    expect(jobs).toHaveLength(1);
    expect(await reviews()).toEqual(before);
  });
});
