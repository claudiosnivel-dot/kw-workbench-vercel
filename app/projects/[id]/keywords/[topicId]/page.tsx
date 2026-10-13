import { notFound } from "next/navigation";
import { AddVolumesNotice } from "@/components/add-volumes-dialog";
import { KeywordsBoard } from "@/components/keywords/keywords-board";
import { RememberTopic } from "@/components/keywords/remember-topic";
import { TopicActions } from "@/components/keywords/topic-actions";
import { SearchProgress } from "@/components/search-progress";
import { requirePageUser } from "@/lib/auth/page-guard";
import { canPerform } from "@/lib/authz/permissions";
import { canChooseLicensedMetrics } from "@/lib/billing/enforce";
import type { SearchParams } from "@/lib/http/search-params";
import { findActiveJobId } from "@/lib/modules/jobs/job-api";
import { keywordsBoardProps, loadKeywordsView } from "@/lib/modules/keywords-page";
import { requireProjectPage } from "@/lib/modules/project-pages";

export const dynamic = "force-dynamic";

type TopicKeywordsPageProps = {
  params: Promise<{ id: string; topicId: string }>;
  searchParams: Promise<SearchParams>;
};

/**
 * Pagina delle keyword di un argomento (T-2403): l'argomento si risolve nel progetto del workspace dell'utente (un
 * argomento di un altro progetto → 404, CWE-639). Sopra l'elenco la ricerca in corso (T-2404) oppure, se le tenute non
 * hanno ancora le ricerche al mese, «Aggiungi i volumi» (T-2405).
 */
export default async function TopicKeywordsPage({ params, searchParams }: TopicKeywordsPageProps) {
  const user = await requirePageUser();
  const [{ id, topicId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const project = await requireProjectPage(user.id, id, {
    subprojects: {
      where: { id: topicId },
      select: { id: true, name: true, seeds: { orderBy: { created_at: "asc" }, select: { keyword: true } } },
    },
  });
  const topic = project.subprojects[0];
  if (!topic) {
    notFound();
  }

  const [view, activeJobId, canAuto] = await Promise.all([
    loadKeywordsView(project.id, topic.id, resolvedSearchParams),
    findActiveJobId(topic.id),
    canChooseLicensedMetrics(user, project.workspace_id),
  ]);
  const needsVolumes = !activeJobId && view.keptTotal > 0 && view.keptWithVolume === 0;

  return (
    <>
      <RememberTopic projectId={project.id} topicId={topic.id} />
      <KeywordsBoard
        {...keywordsBoardProps(view, false)}
        projectId={project.id}
        topic={{ id: topic.id, name: topic.name }}
        searching={Boolean(activeJobId)}
        actions={
          <TopicActions
            projectId={project.id}
            topic={{ id: topic.id, name: topic.name, seeds: topic.seeds.map((seed) => seed.keyword) }}
            canEdit={canPerform(project.role, "section.write")}
          />
        }
        notices={
          activeJobId ? (
            <SearchProgress key={activeJobId} jobId={activeJobId} />
          ) : needsVolumes ? (
            <AddVolumesNotice projectId={project.id} topicId={topic.id} canAuto={canAuto} />
          ) : null
        }
      />
    </>
  );
}
