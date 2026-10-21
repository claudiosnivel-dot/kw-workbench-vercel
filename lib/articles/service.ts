import { z } from "zod";
import { AiTitlesError } from "@/lib/ai/errors";
import { enforcePlatformRequestCap } from "@/lib/ai/requests";
import { type AiSettings, getAiTitlesSettings } from "@/lib/ai/settings";
import { type AuthorizedProject, requireProjectAccess } from "@/lib/authz/workspace";
import { estimateArticleRequests } from "@/lib/articles/lengths";
import { reapStaleArticleRuns } from "@/lib/articles/run";
import type { ArticleView } from "@/lib/articles/view";
import { getOpenRouterSettings } from "@/lib/env";
import { Prisma } from "@/lib/generated/prisma/client";
import { ArticleLength } from "@/lib/generated/prisma/enums";
import { AppError, ConflictError, JOB_ERROR_CODES, ValidationError } from "@/lib/http/errors";
import { scheduleArticleRunContinuation } from "@/lib/modules/jobs/continuation";
import { findPlanId, requirePlanPage } from "@/lib/modules/strategy/service";
import { prisma } from "@/lib/prisma";
import { enforceRateLimits } from "@/lib/security/rate-limit";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

/*
 * Articoli con l'AI (T-4002, D-46): avvio della generazione dell'articolo di una pagina del piano con i limiti, lettura
 * dell'articolo con i blocchi e il lavoro attivo, annullamento del lavoro. Il lavoro nasce pending e il primo passo del
 * motore (T-4101, lib/articles/run.ts) parte con la continuazione programmata dopo l'avvio. Modifiche e riscrittura di
 * un blocco dall'editor (T-4402) sono in lib/articles/edit.ts e usano le stesse regole.
 */

export type Actor = { id: string; isRootAdmin: boolean };

const ACTIVE_RUN = ["pending", "running"] as const;
/** error_code dell'articolo il cui lavoro è stato annullato prima della fine (DELETE .../article/run). */
const CANCELED_CODE = "CANCELED";

export class ArticleNotFoundError extends AppError {
  constructor() {
    super(404, "ARTICLE_NOT_FOUND", "Articolo non trovato");
    this.name = "ArticleNotFoundError";
  }
}

export const activeRunError = (runId?: string) =>
  new AppError(409, JOB_ERROR_CODES.alreadyActive, "C'è già un lavoro in corso per questo articolo", runId ? { runId } : undefined);

// Corpo dell'avvio: strict, così un id di workspace o di progetto nel corpo è un 400 (CWE-639, CWE-915).
const startSchema = z.strictObject({
  length: z.enum(ArticleLength),
  notes: z
    .union([z.null(), z.string().trim().max(1000, "al massimo 1000 caratteri")])
    .optional()
    .transform((value) => (value ? value : null)),
});

/** Corpo validato dallo schema strict; un campo in più o un valore non valido → 400 VALIDATION_ERROR con il campo. */
export function parseArticleBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  if (issue.code === "unrecognized_keys") throw new ValidationError(`Campo non ammesso: ${issue.keys.join(", ")}`);
  throw new ValidationError(`Valore non valido per ${issue.path.map(String).join(".") || "body"}: ${issue.message}`);
}

/**
 * Limiti di un avvio (T-4002) o di una riscrittura (T-4402), root admin escluso (D-43): prima il tetto della
 * piattaforma, che deve avere posto per la stima e non consuma nulla, poi il limite del workspace nelle ultime 24 ore,
 * che consuma un avvio; così un 429 del tetto non toglie nulla al workspace. Il primo che blocca risponde 429
 * RATE_LIMITED con Retry-After.
 */
export async function consumeArticleLimits(
  actor: Actor,
  settings: AiSettings,
  requests: number,
  workspace: { key: string; max: number; windowSeconds: number }
): Promise<void> {
  if (actor.isRootAdmin) return;
  await enforcePlatformRequestCap(settings.platformDailyRequests, requests);
  await enforceRateLimits([{ key: workspace.key, rule: { max: workspace.max, windowSeconds: workspace.windowSeconds } }]);
}

/** Impostazioni dell'AI con gli articoli accesi e la chiave di OpenRouter; altrimenti 503 AI_NOT_CONFIGURED (T-4002, T-4402). */
export async function requireArticleSettings(): Promise<AiSettings> {
  const settings = await getAiTitlesSettings();
  if (!settings.articlesEnabled || !getOpenRouterSettings()) {
    throw new AiTitlesError("AI_NOT_CONFIGURED", "Gli articoli con l'AI non sono attivi");
  }
  return settings;
}

/** Articolo della pagina nel progetto autorizzato, con il lavoro attivo se c'è (CWE-639). */
export function findArticle(project: AuthorizedProject, strategyId: string, pageId: string) {
  return prisma.article.findFirst({
    where: { page_id: pageId, project_id: project.id, project: project.perimeter, page: { strategy_id: strategyId } },
    select: { id: true, runs: { where: { status: { in: [...ACTIVE_RUN] } }, select: { id: true, scope: true } } },
  });
}

export const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Avvio della generazione dell'articolo di una pagina (T-4002): permesso strategy.write e corpo { length, notes? };
 * pagina del piano corrente (404, 409 STRATEGY_READ_ONLY); articoli spenti o chiave assente → 503 AI_NOT_CONFIGURED;
 * un lavoro attivo sull'articolo → 409 JOB_ALREADY_ACTIVE; poi i limiti. In una transazione crea o sostituisce
 * l'articolo (GENERATING, blocchi, meta e controlli cancellati, version cresciuta), crea il lavoro pending con il
 * workspace del progetto e porta la pagina da TODO a WRITING; dopo il commit programma il primo passo del lavoro
 * (T-4101). Due avvii insieme: l'indice unico della pagina o quello del lavoro attivo fa fallire il secondo, che
 * risponde 409 (CWE-362).
 */
export async function startArticle(
  actor: Actor,
  projectId: string,
  strategyId: string,
  pageId: string,
  body: unknown
): Promise<{ articleId: string; runId: string }> {
  const project = await requireProjectAccess(actor, projectId, "strategy.write", {});
  const input = parseArticleBody(startSchema, body);
  const page = await requirePlanPage(project, strategyId, pageId);
  const settings = await requireArticleSettings();
  const existing = await findArticle(project, strategyId, pageId);
  if (existing && existing.runs.length > 0) throw activeRunError(existing.runs[0].id);
  await consumeArticleLimits(actor, settings, estimateArticleRequests(page.h2.length), {
    key: `ai-articles:workspace:${project.workspace_id}`,
    max: settings.articlesPerWorkspaceDaily,
    windowSeconds: rateLimitRules().aiArticlesWorkspace.windowSeconds,
  });

  let started: { articleId: string; runId: string };
  try {
    started = await prisma.$transaction(async (tx) => {
      if ((await findPlanId(project.id, tx)) !== strategyId) {
        throw new ConflictError("Le versioni precedenti del piano sono in sola lettura", "STRATEGY_READ_ONLY");
      }
      const article = await tx.article.findFirst({ where: { page_id: pageId, project_id: project.id }, select: { id: true } });
      let articleId: string;
      if (article) {
        await tx.articleSection.deleteMany({ where: { article_id: article.id, article: { project_id: project.id } } });
        await tx.article.updateMany({
          where: { id: article.id, project_id: project.id },
          data: {
            length: input.length,
            notes: input.notes,
            status: "GENERATING",
            error_code: null,
            meta_title: null,
            meta_description: null,
            slug: null,
            outline: Prisma.DbNull,
            images: Prisma.DbNull,
            seo_report: Prisma.DbNull,
            version: { increment: 1 },
            created_by_user_id: actor.id,
          },
        });
        articleId = article.id;
      } else {
        const created = await tx.article.create({
          data: { page_id: pageId, project_id: project.id, length: input.length, notes: input.notes, created_by_user_id: actor.id },
          select: { id: true },
        });
        articleId = created.id;
      }
      const run = await tx.articleRun.create({
        data: { article_id: articleId, workspace_id: project.workspace_id, scope: "ARTICLE", phase: "outline" },
        select: { id: true },
      });
      await tx.strategyPage.updateMany({
        where: { id: pageId, strategy_id: strategyId, status: "TODO", strategy: { project_id: project.id, project: project.perimeter } },
        data: { status: "WRITING", status_changed_at: new Date() },
      });
      return { articleId, runId: run.id };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    throw activeRunError((await findArticle(project, strategyId, pageId))?.runs[0]?.id);
  }
  scheduleArticleRunContinuation(started.runId);
  return started;
}

const ARTICLE_SELECT = {
  id: true,
  page_id: true,
  status: true,
  length: true,
  notes: true,
  error_code: true,
  meta_title: true,
  meta_description: true,
  slug: true,
  outline: true,
  images: true,
  seo_report: true,
  version: true,
  created_at: true,
  updated_at: true,
  sections: {
    orderBy: { position: "asc" },
    select: { id: true, position: true, kind: true, heading: true, body: true, checks: true, edited: true, model: true, updated_at: true },
  },
  runs: {
    where: { status: { in: [...ACTIVE_RUN] } },
    select: { id: true, scope: true, section_id: true, status: true, phase: true, progress_done: true, progress_total: true },
  },
} satisfies Prisma.ArticleSelect;

type ArticleRecord = Prisma.ArticleGetPayload<{ select: typeof ARTICLE_SELECT }>;

function toArticleView(record: ArticleRecord): ArticleView {
  const run = record.runs[0];
  return {
    id: record.id,
    pageId: record.page_id,
    status: record.status,
    length: record.length,
    notes: record.notes,
    errorCode: record.error_code,
    metaTitle: record.meta_title,
    metaDescription: record.meta_description,
    slug: record.slug,
    outline: record.outline,
    images: record.images,
    seoReport: record.seo_report,
    version: record.version,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
    sections: record.sections.map((section) => ({
      id: section.id,
      position: section.position,
      kind: section.kind,
      heading: section.heading,
      body: section.body,
      checks: section.checks,
      edited: section.edited,
      model: section.model,
      updatedAt: section.updated_at.toISOString(),
    })),
    run: run
      ? {
          id: run.id,
          scope: run.scope,
          sectionId: run.section_id,
          status: run.status,
          phase: run.phase,
          progress: { done: run.progress_done, total: run.progress_total },
        }
      : null,
  };
}

/**
 * Articolo di una pagina (T-4002) per chi legge il progetto: blocchi in ordine e lavoro attivo con l'avanzamento,
 * oppure 404 ARTICLE_NOT_FOUND, anche per una pagina di un altro progetto (CWE-639). Un lavoro attivo fermo riparte
 * prima della risposta come dal cron (T-5201), solo quello dell'articolo letto, e la risposta è lo stato dopo la ripresa.
 */
export async function readArticle(actor: { id: string }, projectId: string, strategyId: string, pageId: string): Promise<ArticleView> {
  const project = await requireProjectAccess(actor, projectId, "project.read", {});
  const where = { page_id: pageId, project_id: project.id, project: project.perimeter, page: { strategy_id: strategyId } };
  const record = await prisma.article.findFirst({ where, select: ARTICLE_SELECT });
  if (!record) throw new ArticleNotFoundError();
  const run = record.runs[0];
  if (!run) return toArticleView(record);
  const { resumed, failed } = await reapStaleArticleRuns({ runId: run.id });
  if (resumed + failed === 0) return toArticleView(record);
  const current = await prisma.article.findFirst({ where, select: ARTICLE_SELECT });
  if (!current) throw new ArticleNotFoundError();
  return toArticleView(current);
}

/**
 * Annulla il lavoro attivo dell'articolo (T-4002): pending o running diventa canceled e il motore si ferma al passo
 * successivo (T-4101); se era la generazione dell'intero articolo, l'articolo in generazione diventa FAILED con
 * error_code CANCELED. Senza articolo 404 ARTICLE_NOT_FOUND, senza lavoro attivo 409 JOB_NOT_CANCELABLE.
 */
export async function cancelArticleRun(actor: { id: string }, projectId: string, strategyId: string, pageId: string): Promise<{ runId: string }> {
  const project = await requireProjectAccess(actor, projectId, "strategy.write", {});
  const article = await findArticle(project, strategyId, pageId);
  if (!article) throw new ArticleNotFoundError();
  const run = article.runs[0];
  const canceled =
    run &&
    (await prisma.$transaction(async (tx) => {
      const { count } = await tx.articleRun.updateMany({
        where: { id: run.id, article_id: article.id, status: { in: [...ACTIVE_RUN] }, article: { project_id: project.id } },
        data: { status: "canceled", locked_until: null },
      });
      if (count === 1 && run.scope === "ARTICLE") {
        await tx.article.updateMany({
          where: { id: article.id, project_id: project.id, status: "GENERATING" },
          data: { status: "FAILED", error_code: CANCELED_CODE },
        });
      }
      return count === 1;
    }));
  if (!canceled) throw new AppError(409, JOB_ERROR_CODES.notCancelable, "Nessun lavoro in corso da annullare");
  return { runId: run.id };
}

/** Pagine del progetto con un articolo (T-4401): il pannello mostra «Apri l'articolo». Il progetto è già autorizzato. */
export async function articlePageIds(projectId: string): Promise<string[]> {
  const articles = await prisma.article.findMany({ where: { project_id: projectId }, select: { page_id: true } });
  return articles.map((article) => article.page_id);
}
