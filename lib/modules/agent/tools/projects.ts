import { z } from "zod";
import { projectAccessWhere, requireProjectAccess } from "@/lib/authz/workspace";
import { defineTool } from "@/lib/modules/agent/tool";
import { KEPT_WHERE } from "@/lib/modules/keep-rule";
import { PLAN_ORDER } from "@/lib/modules/strategy/service";
import { prisma } from "@/lib/prisma";

// Strumenti dei progetti del server MCP (T-7202): leggono con i permessi dell'app (project.read), quindi anche il root
// admin vede solo i progetti dei workspace di cui è membro (CWE-639).

const RECENT_SEARCHES = 5;

export const listProjectsTool = defineTool({
  name: "list_projects",
  description:
    "List the Titan SEO projects of the workspaces the user belongs to, most recently active first: id, name, workspace, language, country, number of topics and of kept keywords, and the current plan (id and version, null without a plan).",
  input: z.object({}).strict(),
  async run(_input, { user }) {
    const rows = await prisma.project.findMany({
      where: projectAccessWhere(user.id, "project.read"),
      orderBy: [{ last_activity_at: "desc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        language_code: true,
        country_code: true,
        updated_at: true,
        workspace: { select: { id: true, name: true } },
        strategies: { orderBy: PLAN_ORDER, take: 1, select: { id: true, version: true } },
        _count: { select: { subprojects: true, keyword_candidates: { where: KEPT_WHERE } } },
      },
    });
    return {
      projects: rows.map((row) => ({
        id: row.id,
        name: row.name,
        workspace: row.workspace,
        language: row.language_code,
        country: row.country_code,
        topics: row._count.subprojects,
        keptKeywords: row._count.keyword_candidates,
        plan: row.strategies[0] ?? null,
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  },
});

export const getProjectTool = defineTool({
  name: "get_project",
  description:
    "Read one project: its topics with seed keywords and keyword counts (all and kept), the last 5 keyword searches with status and progress, and the current plan with id, version, number of pages and of articles (null without a plan).",
  input: z.object({ projectId: z.string().min(1).max(64).describe("Project id from list_projects") }).strict(),
  async run({ projectId }, { user, recordProject }) {
    const project = await requireProjectAccess(user, projectId, "project.read", {
      name: true,
      language_code: true,
      country_code: true,
    });
    recordProject(project.id);

    const [topics, kept, searches, plan] = await Promise.all([
      prisma.subproject.findMany({
        where: { project_id: project.id },
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        select: {
          id: true,
          name: true,
          seeds: { orderBy: [{ created_at: "asc" }, { id: "asc" }], select: { keyword: true } },
          _count: { select: { keyword_candidates: true } },
        },
      }),
      prisma.keywordCandidate.groupBy({
        by: ["subproject_id"],
        where: { project_id: project.id, ...KEPT_WHERE },
        _count: { _all: true },
      }),
      prisma.job.findMany({
        where: { project_id: project.id },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: RECENT_SEARCHES,
        select: {
          id: true,
          subproject_id: true,
          status: true,
          phase: true,
          progress_done: true,
          progress_total: true,
          created_at: true,
          completed_at: true,
        },
      }),
      prisma.strategy.findFirst({
        where: { project_id: project.id },
        orderBy: PLAN_ORDER,
        select: { id: true, name: true, version: true, created_at: true, _count: { select: { pages: true } } },
      }),
    ]);
    const keptByTopic = new Map(kept.map((row) => [row.subproject_id, row._count._all]));
    const articles = plan ? await prisma.article.count({ where: { page: { strategy_id: plan.id } } }) : 0;

    return {
      id: project.id,
      name: project.name,
      language: project.language_code,
      country: project.country_code,
      topics: topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        seeds: topic.seeds.map((seed) => seed.keyword),
        keywords: topic._count.keyword_candidates,
        keptKeywords: keptByTopic.get(topic.id) ?? 0,
      })),
      searches: searches.map((job) => ({
        id: job.id,
        topicId: job.subproject_id,
        status: job.status,
        phase: job.phase,
        progress: { done: job.progress_done, total: job.progress_total },
        createdAt: job.created_at.toISOString(),
        completedAt: job.completed_at?.toISOString() ?? null,
      })),
      plan: plan
        ? {
            id: plan.id,
            name: plan.name,
            version: plan.version,
            createdAt: plan.created_at.toISOString(),
            pages: plan._count.pages,
            articles,
          }
        : null,
    };
  },
});
