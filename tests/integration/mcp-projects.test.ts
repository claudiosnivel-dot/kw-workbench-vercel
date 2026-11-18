// Gate di T-7202 (AC-7202-1, AC-7202-2): strumenti list_projects e get_project del server MCP di Claude Code, con i
// confini dei workspace dell'app: anche il root admin vede solo i progetti dei workspace di cui è membro.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callTool, rootAdminWithKey } from "../helpers/mcp";
import { insertStrategy } from "../helpers/strategy";

type ListedProject = {
  id: string;
  name: string;
  workspace: { id: string; name: string };
  language: string;
  country: string;
  topics: number;
  keptKeywords: number;
  plan: { id: string; version: number } | null;
  updatedAt: string;
};

type ProjectDetail = {
  id: string;
  name: string;
  topics: { id: string; name: string; seeds: string[]; keywords: number; keptKeywords: number }[];
  searches: { id: string; topicId: string; status: string }[];
  plan: { id: string; version: number; pages: number; articles: number } | null;
};

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

/** Root admin con un progetto nel workspace personale W1, uno nel workspace di squadra W2 e un progetto di W3, di un altro. */
async function threeWorkspaces() {
  const root = await rootAdminWithKey("t7202-root");
  const owner = await createUserWithSession({ displayName: "t7202-owner" });
  const team = await prisma.workspace.create({ data: { name: "Squadra W2", slug: "t7202-squadra" } });
  await prisma.membership.createMany({
    data: [
      { workspace_id: team.id, user_id: owner.user.id, role: "OWNER" },
      { workspace_id: team.id, user_id: root.user.id, role: "MEMBER" },
    ],
  });
  const personal = await prisma.project.create({
    data: { name: "Sito personale", workspace_id: root.workspaceId, language_code: "it", country_code: "IT" },
  });
  const shared = await prisma.project.create({
    data: { name: "Sito della squadra", workspace_id: team.id, language_code: "en", country_code: "GB" },
  });
  const foreign = await prisma.project.create({
    data: { name: "Sito di un altro", workspace_id: owner.workspaceId, language_code: "es", country_code: "ES" },
  });
  return { root, team, personal, shared, foreign };
}

describe("strumenti dei progetti del server MCP", () => {
  // covers: AC-7202-1
  it("list_projects elenca i progetti di W1 e W2 con lingua, paese e workspace e non quello di W3", async () => {
    const { root, team, personal, shared, foreign } = await threeWorkspaces();

    const { result, data } = await callTool(root.key, "list_projects");

    expect(result?.isError).not.toBe(true);
    const projects = (data?.projects ?? []) as ListedProject[];
    expect(projects.map((project) => project.id).sort()).toEqual([personal.id, shared.id].sort());
    expect(projects.find((project) => project.id === personal.id)).toMatchObject({
      name: "Sito personale",
      language: "it",
      country: "IT",
      workspace: { id: root.workspaceId },
      plan: null,
    });
    expect(projects.find((project) => project.id === shared.id)).toMatchObject({
      name: "Sito della squadra",
      language: "en",
      country: "GB",
      workspace: { id: team.id, name: "Squadra W2" },
    });
    expect(JSON.stringify(data)).not.toContain(foreign.id);
    expect(JSON.stringify(data)).not.toContain("Sito di un altro");
  });

  // covers: AC-7202-2
  it("get_project dà argomenti, parole di partenza, la ricerca completata e il piano; il progetto di W3 è PROJECT_NOT_FOUND", async () => {
    const { root, personal, foreign } = await threeWorkspaces();
    const shoes = await prisma.subproject.create({ data: { project_id: personal.id, name: "Scarpe", position: 0 } });
    const socks = await prisma.subproject.create({ data: { project_id: personal.id, name: "Calze", position: 1 } });
    await prisma.seed.createMany({
      data: [
        { project_id: personal.id, subproject_id: shoes.id, keyword: "scarpe running" },
        { project_id: personal.id, subproject_id: shoes.id, keyword: "scarpe trail" },
        { project_id: personal.id, subproject_id: socks.id, keyword: "calze tecniche" },
      ],
    });
    const job = await prisma.job.create({
      data: { project_id: personal.id, subproject_id: shoes.id, status: "completed", phase: "done", completed_at: new Date() },
    });
    const plan = await insertStrategy({
      projectId: personal.id,
      version: 4,
      pages: [{ key: "hub", kind: "HUB", keywords: [{ text: "scarpe running", volume: 9900 }] }],
    });

    const detail = await callTool(root.key, "get_project", { projectId: personal.id });

    expect(detail.result?.isError).not.toBe(true);
    const project = detail.data as unknown as ProjectDetail;
    expect(project.id).toBe(personal.id);
    expect(project.topics.map(({ name, seeds }) => ({ name, seeds: [...seeds].sort() }))).toEqual([
      { name: "Scarpe", seeds: ["scarpe running", "scarpe trail"] },
      { name: "Calze", seeds: ["calze tecniche"] },
    ]);
    expect(project.searches).toEqual([expect.objectContaining({ id: job.id, topicId: shoes.id, status: "completed" })]);
    expect(project.plan).toMatchObject({ id: plan.strategyId, version: 4, pages: 1, articles: 0 });

    const denied = await callTool(root.key, "get_project", { projectId: foreign.id });

    expect(denied.result?.isError).toBe(true);
    expect(denied.data).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    const calls = await prisma.agentCall.findMany({ orderBy: { created_at: "asc" } });
    expect(calls.map(({ tool, ok, error_code, project_id }) => ({ tool, ok, error_code, project_id }))).toEqual([
      { tool: "get_project", ok: true, error_code: null, project_id: personal.id },
      { tool: "get_project", ok: false, error_code: "PROJECT_NOT_FOUND", project_id: null },
    ]);
  });

  it("il messaggio d'errore è nella lingua delle preferenze del root admin", async () => {
    const { root, foreign } = await threeWorkspaces();
    await prisma.user.update({ where: { id: root.user.id }, data: { ui_locale: "en" } });

    const english = await callTool(root.key, "get_project", { projectId: foreign.id });
    await prisma.user.update({ where: { id: root.user.id }, data: { ui_locale: "it" } });
    const italian = await callTool(root.key, "get_project", { projectId: foreign.id });

    expect(english.data).toEqual({ code: "PROJECT_NOT_FOUND", message: "Project not found." });
    expect(italian.data).toEqual({ code: "PROJECT_NOT_FOUND", message: "Progetto non trovato." });
  });

  it("list_projects conta argomenti, keyword tenute e dà il piano più recente con la sua version", async () => {
    const { root, personal } = await threeWorkspaces();
    const topic = await prisma.subproject.create({ data: { project_id: personal.id, name: "Scarpe", position: 0 } });
    const keyword = (text: string, rejected: boolean) => ({
      project_id: personal.id,
      subproject_id: topic.id,
      keyword: text,
      normalized_keyword: text,
      canonical_keyword: text,
      source: "seed",
      source_query: text,
      review_status: rejected ? ("rejected" as const) : ("pending" as const),
    });
    await prisma.keywordCandidate.createMany({ data: [keyword("scarpe a", false), keyword("scarpe b", false), keyword("scarpe c", true)] });
    await insertStrategy({ projectId: personal.id, version: 1, createdAt: new Date(Date.now() - 60_000), pages: [] });
    const current = await insertStrategy({ projectId: personal.id, version: 2, pages: [] });

    const { data } = await callTool(root.key, "list_projects");

    const listed = ((data?.projects ?? []) as ListedProject[]).find((project) => project.id === personal.id);
    expect(listed).toMatchObject({ topics: 1, keptKeywords: 2, plan: { id: current.strategyId, version: 2 } });
  });
});
