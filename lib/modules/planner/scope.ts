import { resolveEffectiveProjectSettings } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

/** Sezione del perimetro del round-trip con lingua e profilo di punteggio effettivi. */
export type PlannerSection = { id: string; languageCode: string; scoringProfile: string };

export type PlannerScope = { projectId: string; sections: PlannerSection[] } | { notFound: "project" | "section" };

/**
 * Perimetro di export e import per Keyword Planner (T-904, T-910): il progetto, o la sola sezione indicata, con
 * le impostazioni effettive di ogni sezione. Con ownerUserId il progetto deve appartenere a quell'utente (rotte
 * web, CWE-639); le CLI dell'operatore non lo passano. Una sezione di un altro progetto risulta non trovata.
 */
export async function resolvePlannerScope(input: {
  projectId: string;
  sectionId?: string | null;
  ownerUserId?: string;
}): Promise<PlannerScope> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, ...(input.ownerUserId ? { owner_user_id: input.ownerUserId } : {}) },
    include: { subprojects: true },
  });
  if (!project) {
    return { notFound: "project" };
  }

  const subprojects = input.sectionId
    ? project.subprojects.filter((section: { id: string }) => section.id === input.sectionId)
    : project.subprojects;
  if (input.sectionId && subprojects.length === 0) {
    return { notFound: "section" };
  }

  return {
    projectId: project.id,
    sections: subprojects.map((subproject: (typeof project.subprojects)[number]) => {
      const effective = resolveEffectiveProjectSettings({ project, subproject });
      return { id: subproject.id, languageCode: effective.language_code, scoringProfile: effective.scoring_profile };
    }),
  };
}
