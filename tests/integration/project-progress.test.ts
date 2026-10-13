// Gate di T-2302 (AC-2302-2): lo stato del percorso si legge dal DB con query aggregate e il prossimo passo viene
// dalla funzione pura (D-39).
import { beforeEach, describe, expect, it } from "vitest";
import { loadProjectProgress, loadProjectsProgress } from "@/lib/modules/project-progress";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

async function createTopic(projectId: string, name: string, position: number) {
  return prisma.subproject.create({ data: { project_id: projectId, name, position } });
}

function keywordRows(projectId: string, subprojectId: string, keywords: string[], data: object = {}) {
  return keywords.map((keyword) => ({
    project_id: projectId,
    subproject_id: subprojectId,
    keyword,
    normalized_keyword: keyword,
    canonical_keyword: keyword,
    source: "MOCK",
    source_query: keyword,
    ...data,
  }));
}

beforeEach(async () => {
  await resetDatabase();
});

describe("loadProjectProgress", () => {
  // covers: AC-2302-2
  it("con un argomento con keyword tenute e un secondo con una seed e un job attivo il prossimo passo è searching", async () => {
    const { workspaceId } = await createUserWithSession();
    const project = await prisma.project.create({ data: { name: "Negozio", workspace_id: workspaceId } });
    const first = await createTopic(project.id, "Scarpe running", 0);
    const second = await createTopic(project.id, "Trail running", 1);
    await prisma.keywordCandidate.createMany({ data: keywordRows(project.id, first.id, ["scarpe running", "scarpe trail"]) });
    await prisma.seed.create({ data: { project_id: project.id, subproject_id: second.id, keyword: "trail running" } });
    const job = await prisma.job.create({ data: { project_id: project.id, subproject_id: second.id, status: "running" } });

    const progress = await loadProjectProgress(project.id);

    expect(progress.next).toEqual({ kind: "searching", topicId: second.id, jobId: job.id });
    expect(progress.steps.keywords).toBe("current");
    expect(progress.topics.map((topic) => [topic.name, topic.keptCount, topic.seedCount])).toEqual([
      ["Scarpe running", 2, 0],
      ["Trail running", 0, 1],
    ]);
  });

  it("conta come tenute solo le keyword non rifiutate e non escluse dal filtro marchi; l'ultima strategia vince", async () => {
    const { workspaceId } = await createUserWithSession();
    const project = await prisma.project.create({ data: { name: "Negozio", workspace_id: workspaceId } });
    const topic = await createTopic(project.id, "Scarpe", 0);
    await prisma.keywordCandidate.createMany({
      data: [
        ...keywordRows(project.id, topic.id, ["a", "b"]),
        ...keywordRows(project.id, topic.id, ["c"], { review_status: "rejected" }),
        ...keywordRows(project.id, topic.id, ["d"], { brand_status: "excluded" }),
      ],
    });
    const strategyData = { project_id: project.id, mode: "AUTO" as const, settings: {}, language: "it" };
    const counts = { considered_count: 0, assigned_count: 0, unassigned_count: 0 };
    await prisma.strategy.create({ data: { ...strategyData, ...counts, name: "Vecchia", created_at: new Date("2026-01-01") } });
    const latest = await prisma.strategy.create({ data: { ...strategyData, ...counts, name: "Nuova" } });

    const progress = await loadProjectProgress(project.id);

    expect(progress.topics[0]).toMatchObject({ keptCount: 2, totalCount: 4 });
    expect(progress.keptCount).toBe(2);
    expect(progress.latestStrategy).toEqual({ id: latest.id, pageCount: 0 });
    expect(progress.next).toEqual({ kind: "open_plan", strategyId: latest.id });
  });

  it("più progetti in una chiamata: ogni progetto ha i suoi argomenti, un progetto vuoto chiede un argomento", async () => {
    const { workspaceId } = await createUserWithSession();
    const empty = await prisma.project.create({ data: { name: "Vuoto", workspace_id: workspaceId } });
    const withSeed = await prisma.project.create({ data: { name: "Con seed", workspace_id: workspaceId } });
    const topic = await createTopic(withSeed.id, "Pizzeria", 0);
    await prisma.seed.create({ data: { project_id: withSeed.id, subproject_id: topic.id, keyword: "pizzeria milano" } });

    const progress = await loadProjectsProgress([empty.id, withSeed.id]);

    expect(progress.get(empty.id)?.next).toEqual({ kind: "add_topic" });
    expect(progress.get(withSeed.id)?.next).toEqual({ kind: "run_topic", topicId: topic.id });
    expect(await loadProjectsProgress([])).toEqual(new Map());
  });
});
