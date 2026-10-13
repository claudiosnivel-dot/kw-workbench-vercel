import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/page-guard";
import { lastTopicCookieName } from "@/lib/modules/last-topic";
import { requireProjectPage } from "@/lib/modules/project-pages";
import { keywordsHref, resolveDefaultSectionId } from "@/lib/modules/results-view";

export const dynamic = "force-dynamic";

/**
 * Ingresso del progetto (T-2403): riapre l'ultimo argomento aperto (cookie verificato sul progetto), altrimenti
 * l'argomento predefinito (D-21), altrimenti il primo per posizione; senza argomenti la vista del progetto, che invita
 * ad aggiungerne uno.
 */
export default async function ProjectEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const [project, cookieStore] = await Promise.all([
    requireProjectPage(user.id, id, { subprojects: { select: { id: true, position: true } } }),
    cookies(),
  ]);

  const lastTopicId = cookieStore.get(lastTopicCookieName(project.id))?.value;
  const topicId = project.subprojects.some((topic) => topic.id === lastTopicId)
    ? lastTopicId
    : resolveDefaultSectionId(project.subprojects, project.default_subproject_id);
  redirect(keywordsHref(project.id, topicId ? { subprojectId: topicId } : { view: "all" }));
}
