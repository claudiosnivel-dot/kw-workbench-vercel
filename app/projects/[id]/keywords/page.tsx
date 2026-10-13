import { getTranslations } from "next-intl/server";
import { KeywordsBoard } from "@/components/keywords/keywords-board";
import { requirePageUser } from "@/lib/auth/page-guard";
import { keywordsBoardProps, loadKeywordsView } from "@/lib/modules/keywords-page";
import { type ProjectPageProps, requireProjectPage } from "@/lib/modules/project-pages";

export const dynamic = "force-dynamic";

/**
 * Pagina delle keyword di tutto il progetto (T-2403): la stessa pagina dell'argomento con la colonna Argomento. Un
 * progetto senza argomenti invita ad aggiungerne uno (dalla barra laterale o dalla barra del prossimo passo).
 */
export default async function ProjectKeywordsPage({ params, searchParams }: ProjectPageProps) {
  const user = await requirePageUser();
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const project = await requireProjectPage(user.id, id, { _count: { select: { subprojects: true } } });

  if (project._count.subprojects === 0) {
    const t = await getTranslations("keywords");
    return (
      <section className="card space-y-2">
        <h1 className="text-2xl font-semibold">{t("noTopics")}</h1>
        <p className="text-sm text-slate-600">{t("noTopicsHint")}</p>
      </section>
    );
  }

  const view = await loadKeywordsView(project.id, null, resolvedSearchParams);
  return <KeywordsBoard {...keywordsBoardProps(view, true)} projectId={project.id} topic={null} />;
}
