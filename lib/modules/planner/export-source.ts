import type { PlannerExportRow } from "@/lib/modules/planner/export-keywords";
import { resolvePlannerScope } from "@/lib/modules/planner/scope";
import { prisma } from "@/lib/prisma";

export type PlannerExportSource = { rows: PlannerExportRow[] } | { notFound: "project" | "section" };

/**
 * Candidate del perimetro (progetto o sola sezione, vedi resolvePlannerScope) in ordine keyword asc, id asc,
 * ciascuna con la lingua effettiva della sua sezione.
 */
export async function loadPlannerExportRows(input: {
  projectId: string;
  sectionId?: string | null;
  ownerUserId?: string;
}): Promise<PlannerExportSource> {
  const scope = await resolvePlannerScope(input);
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
