import { ArticleNotFoundError, readArticle } from "@/lib/articles/service";
import type { ArticleView } from "@/lib/articles/view";
import { isWordPressConfigured, WORDPRESS_SELECT } from "@/lib/integrations/wordpress";
import type { StrategyPageKind, StrategyPageStatus } from "@/lib/modules/strategy/types";
import { prisma } from "@/lib/prisma";

/** Pagina del piano dell'articolo come la legge l'editor (T-4401). */
type EditorPlanPage = { id: string; h1: string; kind: StrategyPageKind; contentType: string; h2Count: number; mainKeyword: string };

export type ArticleEditorData = {
  strategyId: string;
  page: EditorPlanPage;
  /** H1 delle pagine dello stesso piano: i link interni del testo e quelli del controllo SEO. */
  pages: Record<string, string>;
  article: ArticleView;
  /**
   * Pubblicazione della pagina (T-4502): version del piano per la PATCH, stato, indirizzo e sito del progetto; il
   * collegamento a WordPress e la bozza già inviata (T-4602).
   */
  publication: {
    strategyVersion: number;
    status: StrategyPageStatus;
    publishedUrl: string | null;
    siteUrl: string | null;
    wordpress: { configured: boolean; postId: number | null; postUrl: string | null };
  };
};

/**
 * Dati della pagina dell'editor (T-4401) per un utente membro del progetto: la pagina del piano in una versione del
 * progetto (l'articolo segue la pagina con «Rigenera», T-2502), l'articolo con i blocchi e il lavoro attivo (T-4002) e
 * gli H1 delle pagine dello stesso piano, con lo stato e l'indirizzo della pagina pubblicata (T-4502) e la bozza su
 * WordPress (T-4602). null senza la pagina nel progetto o senza articolo: la pagina risponde 404
 * come per un progetto di un altro workspace (CWE-639).
 */
export async function readArticleEditor(user: { id: string }, projectId: string, pageId: string): Promise<ArticleEditorData | null> {
  const page = await prisma.strategyPage.findFirst({
    where: { id: pageId, strategy: { project_id: projectId } },
    select: {
      strategy_id: true,
      h1: true,
      kind: true,
      content_type: true,
      h2: true,
      status: true,
      published_url: true,
      strategy: { select: { version: true, project: { select: { site_url: true, ...WORDPRESS_SELECT } } } },
      article: { select: { wp_post_id: true, wp_post_url: true } },
      keywords: { where: { role: "MAIN" }, select: { keyword: true }, take: 1 },
    },
  });
  if (!page) return null;
  const article = await readArticle(user, projectId, page.strategy_id, pageId).catch((error: unknown) => {
    if (error instanceof ArticleNotFoundError) return null;
    throw error;
  });
  if (!article) return null;
  const planPages = await prisma.strategyPage.findMany({
    where: { strategy_id: page.strategy_id, strategy: { project_id: projectId } },
    select: { id: true, h1: true },
  });
  return {
    strategyId: page.strategy_id,
    page: {
      id: pageId,
      h1: page.h1,
      kind: page.kind,
      contentType: page.content_type,
      h2Count: page.h2.length,
      mainKeyword: page.keywords[0]?.keyword ?? page.h1,
    },
    pages: Object.fromEntries(planPages.map((item) => [item.id, item.h1])),
    article,
    publication: {
      strategyVersion: page.strategy.version,
      status: page.status,
      publishedUrl: page.published_url,
      siteUrl: page.strategy.project.site_url,
      wordpress: {
        configured: isWordPressConfigured(page.strategy.project),
        postId: page.article?.wp_post_id ?? null,
        postUrl: page.article?.wp_post_url ?? null,
      },
    },
  };
}
