import { requireIdleArticle } from "@/lib/articles/edit";
import { readArticleExport } from "@/lib/articles/export";
import { renderArticleHtml } from "@/lib/articles/render";
import type { Actor } from "@/lib/articles/service";
import {
  connectionOf,
  WORDPRESS_SELECT,
  type WordPressConnection,
  type WordPressLogContext,
  wordPressFailure,
  wordPressJson,
  wordPressRequest,
} from "@/lib/integrations/wordpress";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

/*
 * Invio dell'articolo a WordPress come bozza (T-4602, D-46): titolo (H1), contenuto (l'HTML dell'export senza l'H1),
 * slug ed estratto (meta description). Un secondo invio aggiorna la stessa bozza; se WordPress non la trova più, o non
 * è più una bozza (pubblicata, programmata, privata o nel cestino), se ne crea una nuova, così l'app non tocca mai un
 * articolo già in linea. Nei log solo id del progetto, status di WordPress ed esito (CWE-532).
 */

/** Stati di WordPress in cui l'articolo è ancora una bozza da aggiornare. */
const DRAFT_STATUSES = new Set(["draft", "pending", "auto-draft"]);
const MAX_POST_ID = 2_147_483_647;
const POST_URL_MAX_LENGTH = 500;

type DraftFields = { title: string; content: string; slug: string; excerpt: string };
type WordPressPost = { id: unknown; link: unknown; status: unknown };

/** Bozza della risposta: id intero positivo, link http(s) fino a 500 caratteri (altrimenti senza link). */
function savedPost(post: Partial<WordPressPost> | null): { postId: number; postUrl: string | null } | null {
  const id = post?.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || id > MAX_POST_ID) return null;
  const link = typeof post?.link === "string" && URL.canParse(post.link) ? new URL(post.link) : null;
  const postUrl = link && /^https?:$/.test(link.protocol) && link.href.length <= POST_URL_MAX_LENGTH ? link.href : null;
  return { postId: id, postUrl };
}

/** 401/403 → WP_AUTH_FAILED, ogni altro status non riuscito → WP_REJECTED. */
function assertAccepted(context: WordPressLogContext, response: Response): void {
  if (response.status === 401 || response.status === 403) throw wordPressFailure(context, response.status, "WP_AUTH_FAILED");
  if (response.status < 200 || response.status > 299) throw wordPressFailure(context, response.status, "WP_REJECTED");
}

/** true se la bozza salvata esiste ancora su WordPress e non è stata pubblicata. */
async function isStillDraft(context: WordPressLogContext, connection: WordPressConnection, postId: number): Promise<boolean> {
  const response = await wordPressRequest(context, connection, `posts/${postId}?context=edit`);
  if (response.status === 404 || response.status === 410) return false;
  assertAccepted(context, response);
  const post = await wordPressJson<WordPressPost>(response);
  return typeof post?.status === "string" && DRAFT_STATUSES.has(post.status);
}

/**
 * POST .../article/wordpress (T-4602) con strategy.write e nessun lavoro attivo sull'articolo: senza collegamento 409
 * WP_NOT_CONFIGURED; poi crea la bozza (status draft) o aggiorna quella salvata, e salva id e link della risposta.
 */
export async function sendArticleToWordPress(
  actor: Actor,
  projectId: string,
  strategyId: string,
  pageId: string
): Promise<{ postId: number; postUrl: string | null }> {
  const { project, articleId } = await requireIdleArticle(actor, projectId, strategyId, pageId);
  const context = { event: "wordpress_send", projectId: project.id };
  const [settings, saved] = await Promise.all([
    prisma.project.findFirstOrThrow({ where: { id: project.id, ...project.perimeter }, select: WORDPRESS_SELECT }),
    prisma.article.findFirstOrThrow({ where: { id: articleId, project_id: project.id }, select: { wp_post_id: true } }),
  ]);
  const connection = connectionOf(settings);
  if (!connection) throw wordPressFailure(context, null, "WP_NOT_CONFIGURED");

  const { article, slug } = await readArticleExport(actor, projectId, strategyId, pageId);
  const fields: DraftFields = { title: article.h1, content: renderArticleHtml(article, { title: false }), slug, excerpt: article.metaDescription ?? "" };
  const update = saved.wp_post_id !== null && (await isStillDraft(context, connection, saved.wp_post_id));
  let response = update ? await wordPressRequest(context, connection, `posts/${saved.wp_post_id}`, fields) : null;
  if (!response || response.status === 404) {
    response = await wordPressRequest(context, connection, "posts", { status: "draft", ...fields });
  }
  assertAccepted(context, response);
  const post = savedPost(await wordPressJson<WordPressPost>(response));
  if (!post) throw wordPressFailure(context, response.status, "WP_REJECTED");

  await prisma.article.updateMany({ where: { id: articleId, project_id: project.id }, data: { wp_post_id: post.postId, wp_post_url: post.postUrl } });
  logger.info(context.event, { projectId: project.id, status: response.status, outcome: "ok" });
  return post;
}
