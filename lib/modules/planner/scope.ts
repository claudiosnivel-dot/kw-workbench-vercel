import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveEffectiveProjectSettings } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

/** Sezione del perimetro del round-trip con lingua e profilo di punteggio effettivi. */
export type PlannerSection = { id: string; languageCode: string; scoringProfile: string };

export type PlannerScope =
  | { projectId: string; perimeter: Prisma.ProjectWhereInput; sections: PlannerSection[] }
  | { notFound: "project" | "section" };

/**
 * Perimetro di export e import per Keyword Planner (T-904, T-910): il progetto, o la sola sezione indicata, con
 * le impostazioni effettive di ogni sezione. Con perimeter il progetto deve stare nel workspace dell'utente con il ruolo
 * dell'azione (rotte web, T-1502, CWE-639) e le scritture lo portano nel where; le CLI dell'operatore non lo passano.
 * Una sezione di un altro progetto risulta non trovata.
 */
export async function resolvePlannerScope(input: {
  projectId: string;
  sectionId?: string | null;
  perimeter?: Prisma.ProjectWhereInput;
}): Promise<PlannerScope> {
  const perimeter = input.perimeter ?? {};
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, ...perimeter },
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
    perimeter,
    sections: subprojects.map((subproject: (typeof project.subprojects)[number]) => {
      const effective = resolveEffectiveProjectSettings({ project, subproject });
      return { id: subproject.id, languageCode: effective.language_code, scoringProfile: effective.scoring_profile };
    }),
  };
}
