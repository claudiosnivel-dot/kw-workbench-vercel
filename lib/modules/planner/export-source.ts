import { resolveEffectiveProjectSettings } from "@/lib/modules/project-settings";
import type { PlannerExportRow } from "@/lib/modules/planner/export-keywords";
import { prisma } from "@/lib/prisma";

export type PlannerExportSource = { rows: PlannerExportRow[] } | { notFound: "project" | "section" };

/**
 * Candidate del progetto, o della sola sezione indicata, in ordine keyword asc, id asc, ciascuna con la lingua
 * effettiva della sua sezione. Con ownerUserId il progetto deve appartenere a quell'utente (rotta web, CWE-639);
 * la CLI dell'operatore non lo passa. Una sezione di un altro progetto risulta non trovata.
 */
export async function loadPlannerExportRows(input: {
  projectId: string;
  sectionId?: string | null;
  ownerUserId?: string;
}): Promise<PlannerExportSource> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, ...(input.ownerUserId ? { owner_user_id: input.ownerUserId } : {}) },
    include: { subprojects: true },
  });
  if (!project) {
    return { notFound: "project" };
  }

  const sections = input.sectionId
    ? project.subprojects.filter((section: { id: string }) => section.id === input.sectionId)
    : project.subprojects;
  if (input.sectionId && sections.length === 0) {
    return { notFound: "section" };
  }

  const languageBySection = new Map<string, string>(
    sections.map((section: (typeof project.subprojects)[number]) => [
      section.id,
      resolveEffectiveProjectSettings({ project, subproject: section }).language_code,
    ])
  );
  const candidates = await prisma.keywordCandidate.findMany({
    where: { project_id: project.id, subproject_id: { in: [...languageBySection.keys()] } },
    select: { id: true, keyword: true, subproject_id: true },
    orderBy: [{ keyword: "asc" }, { id: "asc" }],
  });

  return {
    rows: candidates.map((candidate: { keyword: string; subproject_id: string }) => ({
      keyword: candidate.keyword,
      languageCode: languageBySection.get(candidate.subproject_id) ?? project.language_code,
    })),
  };
}
