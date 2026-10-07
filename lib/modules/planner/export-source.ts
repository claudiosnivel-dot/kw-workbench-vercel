import { requireProjectAccess } from "@/lib/authz/workspace";
import type { PlannerExportRow } from "@/lib/modules/planner/export-keywords";
import { resolvePlannerScope } from "@/lib/modules/planner/scope";
import { prisma } from "@/lib/prisma";

export type PlannerExportSource = { rows: PlannerExportRow[] } | { notFound: "project" | "section" };

/**
 * Candidate del perimetro (progetto o sola sezione, vedi resolvePlannerScope) in ordine keyword asc, id asc,
 * ciascuna con la lingua effettiva della sua sezione. Con user (rotta web, T-1502) il progetto deve stare in un
 * workspace dell'utente con export.run: non membro 404 PROJECT_NOT_FOUND, ruolo insufficiente 403; la CLI non lo passa.
 */
export async function loadPlannerExportRows(input: {
  projectId: string;
  sectionId?: string | null;
  user?: { id: string };
}): Promise<PlannerExportSource> {
  const perimeter = input.user ? (await requireProjectAccess(input.user, input.projectId, "export.run", {})).perimeter : undefined;
  const scope = await resolvePlannerScope({ projectId: input.projectId, sectionId: input.sectionId, perimeter });
  if ("notFound" in scope) {
    return scope;
  }

  const languageBySection = new Map(scope.sections.map((section) => [section.id, section.languageCode]));
  const candidates = await prisma.keywordCandidate.findMany({
    where: { project_id: scope.projectId, subproject_id: { in: [...languageBySection.keys()] } },
    select: { id: true, keyword: true, subproject_id: true },
    orderBy: [{ keyword: "asc" }, { id: "asc" }],
  });

  return {
    rows: candidates.map((candidate: { keyword: string; subproject_id: string }) => ({
      keyword: candidate.keyword,
      languageCode: languageBySection.get(candidate.subproject_id) ?? "en",
    })),
  };
}
