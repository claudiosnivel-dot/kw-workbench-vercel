import { z } from "zod";
import { AiTitlesError } from "@/lib/ai/errors";
import { authorBlockChecks, seoReport } from "@/lib/articles/checks";
import { SECTION_REWRITE_REQUESTS } from "@/lib/articles/lengths";
import { sanitizeSectionMarkdown } from "@/lib/articles/markdown-sanitizer";
import type { ArticleView } from "@/lib/articles/view";
import { readPhaseArticle } from "@/lib/articles/phase-data";
import {
  activeRunError,
  type Actor,
  ArticleNotFoundError,
  consumeArticleLimits,
  findArticle,
  isUniqueViolation,
  parseArticleBody,
  readArticle,
  requireArticleSettings,
} from "@/lib/articles/service";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { AppError, ValidationError } from "@/lib/http/errors";
import { scheduleArticleRunContinuation } from "@/lib/modules/jobs/continuation";
import { requirePlanPage } from "@/lib/modules/strategy/service";
import { prisma } from "@/lib/prisma";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

/*
 * Modifiche dell'articolo dall'editor (T-4402, D-46): testo dei blocchi, meta title, meta description e slug con la
 * version dell'articolo (CWE-362), con i controlli e il rapporto SEO ricalcolati senza il modello; «Riscrivi questa
 * sezione» come lavoro con scope SECTION entro i limiti. Il testo dell'autore passa dalla stessa pulizia del testo del
 * modello (CWE-79).
 */

/** Limiti di T-4102 per meta e slug. */
const MAX_META_TITLE = 60;
const MAX_META_DESCRIPTION = 155;
const MAX_SLUG = 80;
/** Testo di un blocco: ben oltre le parole del tetto più lungo (2500 per l'intero articolo). */
const MAX_BODY = 30_000;
/** Blocchi di un articolo: introduzione, fino a 20 H2 della pilastro e FAQ, con margine. */
const MAX_SECTIONS = 40;
const MAX_INSTRUCTION = 500;
/** Lettere minuscole e cifre in gruppi separati da un trattino: nessuna ripetizione ambigua (CWE-1333). */
const SLUG_PATTERN = /^[\p{Ll}\p{Lo}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{N}]+)*$/u;

const metaText = (max: number) => z.string().trim().min(1, "obbligatorio").max(max, `al massimo ${max} caratteri`);

// Strict: un id di articolo, progetto o workspace nel corpo è un 400 (CWE-639, CWE-915).
const patchSchema = z.strictObject({
  version: z.number().int().min(0),
  sections: z
    .array(z.strictObject({ id: z.string().min(1).max(64), body: z.string().max(MAX_BODY) }))
    .max(MAX_SECTIONS)
    .optional(),
  meta_title: metaText(MAX_META_TITLE).optional(),
  meta_description: metaText(MAX_META_DESCRIPTION).optional(),
  slug: metaText(MAX_SLUG).regex(SLUG_PATTERN, "lettere minuscole e cifre separate da trattini").optional(),
});

const rewriteSchema = z.strictObject({
  instruction: z
    .union([z.null(), z.string().trim().max(MAX_INSTRUCTION, `al massimo ${MAX_INSTRUCTION} caratteri`)])
    .optional()
    .transform((value) => value || null),
});

const versionConflict = () => new AppError(409, "ARTICLE_VERSION_CONFLICT", "L'articolo è stato modificato altrove");

/** Testo dell'autore ripulito come quello del modello (T-4201); i link page: valgono solo verso le pagine collegabili. */
function cleanBody(body: string, links: ReadonlyMap<string, string>): string {
  try {
    return sanitizeSectionMarkdown(body, links);
  } catch (error) {
    if (error instanceof AiTitlesError) throw new ValidationError("Il testo del blocco è vuoto");
    throw error;
  }
}

/** Articolo della pagina del piano corrente, senza lavori attivi; altrimenti 404, 409 STRATEGY_READ_ONLY o JOB_ALREADY_ACTIVE. */
async function requireIdleArticle(actor: Actor, projectId: string, strategyId: string, pageId: string) {
  const project = await requireProjectAccess(actor, projectId, "strategy.write", {});
  await requirePlanPage(project, strategyId, pageId);
  const article = await findArticle(project, strategyId, pageId);
  if (!article) throw new ArticleNotFoundError();
  if (article.runs.length > 0) throw activeRunError(article.runs[0].id);
  return { project, articleId: article.id };
}

/**
 * PATCH dell'articolo (T-4402) con { version, sections?, meta_title?, meta_description?, slug? }: permesso strategy.write
 * e nessun lavoro attivo; ogni blocco indicato deve essere dell'articolo, una volta sola, e il suo testo ripulito non
 * vuoto (400). In una transazione la version cresce solo se è quella inviata (altrimenti 409 ARTICLE_VERSION_CONFLICT),
 * i blocchi salvati diventano edited con i controlli del nuovo testo e il rapporto SEO si ricalcola sull'articolo
 * modificato, senza richieste al modello. Risponde con l'articolo aggiornato.
 */
export async function updateArticle(actor: Actor, projectId: string, strategyId: string, pageId: string, body: unknown): Promise<ArticleView> {
  const { project, articleId } = await requireIdleArticle(actor, projectId, strategyId, pageId);
  const input = parseArticleBody(patchSchema, body);
  const current = await readPhaseArticle({ articleId, projectId: project.id });
  const links = new Map(current.plan.linkable.map((page) => [page.pageId, page.pageId]));
  const bodies = new Map<string, string>();
  for (const section of input.sections ?? []) {
    if (bodies.has(section.id) || !current.sections.some((item) => item.id === section.id)) {
      throw new ValidationError("Blocco non valido per questo articolo");
    }
    bodies.set(section.id, cleanBody(section.body, links));
  }
  const article = {
    ...current,
    metaTitle: input.meta_title ?? current.metaTitle,
    metaDescription: input.meta_description ?? current.metaDescription,
    sections: current.sections.map((section) => {
      const text = bodies.get(section.id);
      return text === undefined ? section : { ...section, body: text, edited: true };
    }),
  };

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.article.updateMany({
      where: { id: articleId, project_id: project.id, version: input.version },
      data: {
        version: { increment: 1 },
        meta_title: input.meta_title,
        meta_description: input.meta_description,
        slug: input.slug,
        seo_report: seoReport(article),
      },
    });
    if (count !== 1) throw versionConflict();
    for (const section of article.sections) {
      if (!bodies.has(section.id)) continue;
      await tx.articleSection.updateMany({
        where: { id: section.id, article_id: articleId, article: { project_id: project.id } },
        data: { body: section.body, edited: true, checks: authorBlockChecks(article, section.position) },
      });
    }
  });
  return readArticle(actor, projectId, strategyId, pageId);
}

/**
 * «Riscrivi questo blocco» (T-4402) con { instruction? } fino a 500 caratteri: nessun lavoro attivo (409
 * JOB_ALREADY_ACTIVE), articoli accesi con la chiave (503 AI_NOT_CONFIGURED), blocco dell'articolo (404), poi i
 * limiti: il tetto della piattaforma con la stima di una riscrittura e le sezioni riscritte del workspace nelle ultime
 * 24 ore (429 RATE_LIMITED), root admin escluso (D-43). Crea il lavoro pending con scope SECTION nella fase sections e
 * fa crescere la version dell'articolo, così una modifica aperta prima non sovrascrive il nuovo testo; il motore
 * (T-4101) riscrive il blocco con edited false. Due avvii insieme: l'indice del lavoro attivo fa fallire il secondo.
 */
export async function startSectionRewrite(
  actor: Actor,
  projectId: string,
  strategyId: string,
  pageId: string,
  sectionId: string,
  body: unknown
): Promise<{ runId: string }> {
  const { project, articleId } = await requireIdleArticle(actor, projectId, strategyId, pageId);
  const input = parseArticleBody(rewriteSchema, body);
  const settings = await requireArticleSettings();
  const section = await prisma.articleSection.findFirst({
    where: { id: sectionId, article_id: articleId, article: { project_id: project.id } },
    select: { id: true },
  });
  if (!section) throw new ArticleNotFoundError();
  await consumeArticleLimits(actor, settings, SECTION_REWRITE_REQUESTS, {
    key: `ai-section-rewrites:workspace:${project.workspace_id}`,
    max: settings.sectionRewritesPerWorkspaceDaily,
    windowSeconds: rateLimitRules().aiSectionRewritesWorkspace.windowSeconds,
  });

  let runId: string;
  try {
    runId = await prisma.$transaction(async (tx) => {
      await tx.article.updateMany({ where: { id: articleId, project_id: project.id }, data: { version: { increment: 1 } } });
      const run = await tx.articleRun.create({
        data: {
          article_id: articleId,
          workspace_id: project.workspace_id,
          scope: "SECTION",
          section_id: section.id,
          instruction: input.instruction,
          phase: "sections",
          progress_total: 1,
        },
        select: { id: true },
      });
      return run.id;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    throw activeRunError();
  }
  scheduleArticleRunContinuation(runId);
  return { runId };
}
