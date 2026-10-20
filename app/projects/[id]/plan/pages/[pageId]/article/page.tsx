import { notFound } from "next/navigation";
import { ArticleEditor } from "@/components/article/article-editor";
import { isArticlesAvailable } from "@/lib/ai/settings";
import { readArticleEditor } from "@/lib/articles/editor-data";
import { requirePageUser } from "@/lib/auth/page-guard";
import { canPerform } from "@/lib/authz/permissions";
import { requireProjectPage } from "@/lib/modules/project-pages";

export const dynamic = "force-dynamic";

/**
 * Editor dell'articolo di una pagina del piano (T-4401, T-4402): progetto nel workspace dell'utente, pagina e articolo
 * del progetto, altrimenti 404 (CWE-639). Modifiche e riscritture con strategy.write; nuova generazione e «Riscrivi
 * questo blocco» anche con gli articoli accesi e la chiave. L'editor riparte dai dati del server a ogni nuova version
 * letta dalla pagina (per esempio dopo una nuova generazione).
 */
export default async function ArticleEditorPage({ params }: { params: Promise<{ id: string; pageId: string }> }) {
  const user = await requirePageUser();
  const { id, pageId } = await params;
  const project = await requireProjectPage(user.id, id, {});
  const data = await readArticleEditor(user, project.id, pageId);
  if (!data) notFound();
  const canEdit = canPerform(project.role, "strategy.write");
  const canStart = canEdit && (await isArticlesAvailable());

  return (
    <ArticleEditor
      key={data.article.version}
      projectId={project.id}
      strategyId={data.strategyId}
      page={data.page}
      pages={data.pages}
      article={data.article}
      canEdit={canEdit}
      canStart={canStart}
      publication={data.publication}
    />
  );
}
