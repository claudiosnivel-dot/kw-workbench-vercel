import { ACTIVE_JOB_STATUSES } from "@/lib/modules/jobs/job-state";
import { KEPT_WHERE } from "@/lib/modules/keep-rule";
import { computeProjectProgress, type ProjectProgressData, type TopicProgress } from "@/lib/modules/next-step";
import { prisma } from "@/lib/prisma";

function countBySubproject(rows: { subproject_id: string; _count: { _all: number } }[]): Map<string, number> {
  return new Map(rows.map((row) => [row.subproject_id, row._count._all]));
}

/**
 * Stato del percorso di più progetti con cinque query aggregate in tutto, qualunque sia il numero di progetti e di
 * keyword (conteggi con groupBy, nessuna query per progetto né per keyword): la home lo usa per una pagina
 * dell'elenco, il layout del progetto per un solo progetto. I progetti vanno già risolti nel workspace dell'utente
 * (requireProjectPage, listDashboardProjects): qui non c'è controllo di accesso.
 */
export async function loadProjectsProgress(projectIds: string[]): Promise<Map<string, ProjectProgressData>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const inProjects = { project_id: { in: projectIds } };
  const [subprojects, totals, kept, activeJobs, strategies] = await Promise.all([
    prisma.subproject.findMany({
      where: inProjects,
      orderBy: [{ position: "asc" }, { created_at: "asc" }],
      select: { id: true, name: true, project_id: true, _count: { select: { seeds: true } } },
    }),
    prisma.keywordCandidate.groupBy({ by: ["subproject_id"], where: inProjects, _count: { _all: true } }),
    prisma.keywordCandidate.groupBy({ by: ["subproject_id"], where: { ...inProjects, ...KEPT_WHERE }, _count: { _all: true } }),
    prisma.job.findMany({
      where: { ...inProjects, status: { in: ACTIVE_JOB_STATUSES } },
      orderBy: { created_at: "asc" },
      select: { id: true, subproject_id: true },
    }),
    prisma.strategy.findMany({
      where: inProjects,
      orderBy: [{ project_id: "asc" }, { created_at: "desc" }],
      distinct: ["project_id"],
      select: { id: true, project_id: true, _count: { select: { pages: true } } },
    }),
  ]);

  const totalBySubproject = countBySubproject(totals);
  const keptBySubproject = countBySubproject(kept);
  const activeJobBySubproject = new Map<string, string>();
  for (const job of activeJobs) {
    if (!activeJobBySubproject.has(job.subproject_id)) {
      activeJobBySubproject.set(job.subproject_id, job.id);
    }
  }
  const strategyByProject = new Map(strategies.map((strategy) => [strategy.project_id, strategy]));

  return new Map(
    projectIds.map((projectId) => {
      const topics: TopicProgress[] = subprojects
        .filter((subproject) => subproject.project_id === projectId)
        .map((subproject) => ({
          id: subproject.id,
          name: subproject.name,
          keptCount: keptBySubproject.get(subproject.id) ?? 0,
          totalCount: totalBySubproject.get(subproject.id) ?? 0,
          seedCount: subproject._count.seeds,
          activeJobId: activeJobBySubproject.get(subproject.id) ?? null,
        }));
      const strategy = strategyByProject.get(projectId);
      const progress = computeProjectProgress({ topics, latestStrategyId: strategy?.id ?? null });
      return [
        projectId,
        {
          ...progress,
          topics,
          keptCount: topics.reduce((sum, item) => sum + item.keptCount, 0),
          latestStrategy: strategy ? { id: strategy.id, pageCount: strategy._count.pages } : null,
        },
      ];
    })
  );
}

/** Stato del percorso di un progetto già risolto nel workspace dell'utente (layout del progetto, T-2303). */
export async function loadProjectProgress(projectId: string): Promise<ProjectProgressData> {
  const progress = (await loadProjectsProgress([projectId])).get(projectId);
  if (!progress) {
    throw new Error(`Stato del progetto ${projectId} non calcolato`);
  }
  return progress;
}
