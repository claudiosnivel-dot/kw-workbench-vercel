import { requireProjectAccess } from "@/lib/authz/workspace";
import { renderArticleDocx } from "@/lib/articles/docx";
import { articleSlug } from "@/lib/articles/outline-response";
import { type ArticleExport, renderArticleHtml, renderArticleMarkdown } from "@/lib/articles/render";
import { ArticleNotFoundError } from "@/lib/articles/service";
import { articleImages } from "@/lib/articles/view";
import { prisma } from "@/lib/prisma";

/*
 * Export dell'articolo di una pagina del piano (T-4501, T-4502): HTML con i dati strutturati, Markdown e Word, come
 * allegato con il nome dallo slug. Lo legge chi legge il progetto; un articolo di un altro workspace è 404 (CWE-639).
 */

export const ARTICLE_EXPORT_FORMATS = ["html", "md", "docx"] as const;
export type ArticleExportFormat = (typeof ARTICLE_EXPORT_FORMATS)[number];

const CONTENT_TYPES: Record<ArticleExportFormat, string> = {
  html: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Nome del file in caratteri ASCII: lo slug senza accenti, oppure «article». */
const fileName = (slug: string, format: ArticleExportFormat) =>
  `${
    slug
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "article"
  }.${format}`;

/**
 * Articolo da esportare (T-4501): blocchi in ordine, segnaposto immagine, indirizzo del sito e attività della scheda del
 * progetto, e le pagine dello stesso piano con l'indirizzo pubblicato e lo slug (del loro articolo, altrimenti dalla
 * keyword principale) per i link e le briciole. LocalBusiness solo per una pagina locale con nome e indirizzo.
 */
export async function readArticleExport(
  actor: { id: string },
  projectId: string,
  strategyId: string,
  pageId: string
): Promise<{ article: ArticleExport; slug: string }> {
  const project = await requireProjectAccess(actor, projectId, "project.read", { site_url: true, business_name: true, business_address: true });
  const [record, pages] = await Promise.all([
    prisma.article.findFirst({
      where: { page_id: pageId, project_id: project.id, project: project.perimeter, page: { strategy_id: strategyId } },
      select: {
        meta_description: true,
        images: true,
        sections: { orderBy: { position: "asc" }, select: { position: true, kind: true, heading: true, body: true } },
        page: { select: { h1: true, kind: true, hub_page_id: true, content_type: true, strategy: { select: { language: true } } } },
      },
    }),
    prisma.strategyPage.findMany({
      where: { strategy_id: strategyId, strategy: { project_id: project.id, project: project.perimeter } },
      select: { id: true, h1: true, published_url: true, article: { select: { slug: true } }, keywords: { where: { role: "MAIN" }, select: { keyword: true }, take: 1 } },
    }),
  ]);
  if (!record) throw new ArticleNotFoundError();
  const { page } = record;
  const language = page.strategy.language;
  const targets = Object.fromEntries(
    pages.map((item) => [item.id, { publishedUrl: item.published_url, slug: item.article?.slug || articleSlug(item.keywords[0]?.keyword ?? item.h1, language) }])
  );
  const hub = page.kind === "SPOKE" ? pages.find((item) => item.id === page.hub_page_id) : undefined;
  const business =
    page.content_type === "local" && project.business_name && project.business_address
      ? { name: project.business_name, address: project.business_address }
      : null;
  return {
    slug: targets[pageId]?.slug ?? "",
    article: {
      h1: page.h1,
      language,
      metaDescription: record.meta_description,
      sections: record.sections,
      images: articleImages(record.images),
      siteUrl: project.site_url,
      pages: targets,
      breadcrumb: [...(hub ? [{ pageId: hub.id, name: hub.h1 }] : []), { pageId, name: page.h1 }],
      business,
    },
  };
}

/** File dell'export (T-4501, T-4502): allegato con il nome dallo slug, mai in cache. */
export async function articleExportResponse(
  actor: { id: string },
  projectId: string,
  strategyId: string,
  pageId: string,
  format: ArticleExportFormat
): Promise<Response> {
  const { article, slug } = await readArticleExport(actor, projectId, strategyId, pageId);
  const body = format === "html" ? renderArticleHtml(article) : format === "md" ? renderArticleMarkdown(article) : new Uint8Array(await renderArticleDocx(article));
  const headers = new Headers({ "Content-Type": CONTENT_TYPES[format], "Cache-Control": "no-store" });
  headers.set("Content-Disposition", `attachment; filename="${fileName(slug, format)}"`);
  return new Response(body, { status: 200, headers });
}
