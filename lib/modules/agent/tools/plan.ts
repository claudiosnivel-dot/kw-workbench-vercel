import { z } from "zod";
import { projectAccessWhere, requireProjectAccess } from "@/lib/authz/workspace";
import { AppError } from "@/lib/http/errors";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { guardAgentOperation, guardAgentPagePatch } from "@/lib/modules/agent/plan-guard";
import { assertAgentSpendAllowed, readAgentSpend } from "@/lib/modules/agent/spend";
import { type AgentToolContext, defineTool } from "@/lib/modules/agent/tool";
import { pollUntilFinished } from "@/lib/modules/agent/wait";
import { PlanRunNotFoundError, readPlanRunStatus, startPlanRun } from "@/lib/modules/plan-runs/service";
import { isPlanRunActive } from "@/lib/modules/plan-runs/types";
import { expertSettingsSchema } from "@/lib/modules/strategy/rules";
import {
  findPlanId,
  OPERATION_SCHEMAS,
  operateOnStrategy,
  PAGE_PATCH_SHAPE,
  parseGenerateRequest,
  patchStrategyPage,
  readStrategy,
  StrategyNotFoundError,
} from "@/lib/modules/strategy/service";
import { catalogTranslator } from "@/lib/modules/strategy/translator";
import { hasLocalTips, type StrategyKeywordView, type StrategyPageView, type StrategyView } from "@/lib/modules/strategy/types";
import { prisma } from "@/lib/prisma";

// Strumenti del piano del server MCP (T-7501, T-7502, D-64): Claude Code costruisce il piano con i dati di Titan SEO ma
// senza le sue AI (lavoro di piano con origin AGENT), lo legge a pagine con il cursore (T-8201, D-70) e lo modifica con
// le operazioni e la version dell'app, senza poter svuotare, unire, spostare o ritoccare le pagine già iniziate (guardia
// di plan-guard.ts). Permessi dell'app: strategy.write per avviare e modificare, project.read per leggere.

const idField = (description: string) => z.string().min(1).max(64).describe(description);
const projectIdField = idField("Project id from list_projects or create_project");
const versionField = z.number().int().min(0).describe("Plan version from your last get_plan (or from the last edit)");

/** Piano corrente del progetto già autorizzato: 404 STRATEGY_NOT_FOUND se non ne ha ancora uno. */
async function currentPlanId(projectId: string): Promise<string> {
  const planId = await findPlanId(projectId);
  if (!planId) throw new StrategyNotFoundError();
  return planId;
}

export const buildPlanTool = defineTool({
  name: "build_plan",
  description:
    "Build the content plan of a project from its kept keywords, or rebuild it when the project already has one (pages that are not To write keep their keywords, the previous version stays readable in Titan SEO). Titan SEO fills the missing search volumes, fetches the Google results of the top 1000 keywords and groups the keywords that share results; places and competitors are recognized only by fixed rules and no AI of Titan SEO is used, so judging places, competitors and angles is up to you. Optional settings restrict the keywords (topic, review status, minimum volume, intent, type) and change the grouping rules. One plan job at a time per project: JOB_ALREADY_ACTIVE gives the runId of the running one. Answers with runId and today's spending against the daily cap; wait for it with wait_for_job (runId) and read the plan with get_plan.",
  input: z
    .object({
      projectId: projectIdField,
      settings: expertSettingsSchema.optional().describe("Perimeter and grouping rules; the default plan of the whole project when omitted"),
    })
    .strict(),
  async run(input, { user, recordProject }) {
    const project = await requireProjectAccess(user, input.projectId, "strategy.write", {});
    recordProject(project.id);
    const regenerate = (await findPlanId(project.id)) !== null;
    const request = parseGenerateRequest({ mode: input.settings ? "EXPERT" : "AUTO", settings: input.settings, regenerate });
    const spend = await assertAgentSpendAllowed();
    const name = catalogTranslator(user.uiLocale ?? DEFAULT_LOCALE)("strategy.ui.defaultName", { mode: request.mode, date: new Date() });
    const runId = await startPlanRun(user, project.id, request, name, "AGENT");
    return { runId, regenerate, spend };
  },
});

/**
 * Attesa di un lavoro di piano per wait_for_job (T-7501): il lavoro di un progetto non leggibile è 404 come uno che non
 * esiste (CWE-639); ogni lettura riprende il lavoro se è fermo, come la barra del piano (T-6202).
 */
export async function waitForPlanRun(runId: string, { user, recordProject }: AgentToolContext) {
  const owned = await prisma.planRun.findFirst({
    where: { id: runId, project: projectAccessWhere(user.id, "project.read") },
    select: { project_id: true },
  });
  if (!owned) throw new PlanRunNotFoundError();
  recordProject(owned.project_id);

  const { value: run, finished } = await pollUntilFinished(
    () => readPlanRunStatus(user, owned.project_id, runId),
    (view) => !isPlanRunActive(view.status)
  );
  return {
    runId: run.id,
    status: run.status,
    phase: run.phase,
    finished,
    progress: run.progress,
    ...(run.status === "completed" ? { strategyId: run.strategyId } : {}),
    ...(run.status === "failed" ? { error: run.errorCode } : {}),
    spend: await readAgentSpend(),
  };
}

function planKeyword(keyword: StrategyKeywordView) {
  return {
    id: keyword.id,
    keyword: keyword.keyword,
    volume: keyword.volume,
    score: keyword.score,
    role: keyword.role,
    angle: keyword.angle,
    sourceKeywordId: keyword.sourceKeywordId ?? null,
  };
}

function planPage(page: StrategyPageView, index: number) {
  return {
    id: page.id,
    number: index + 1,
    kind: page.kind,
    hubPageId: page.hubPageId,
    h1: page.h1,
    h2: page.h2,
    contentType: page.contentType,
    status: page.status,
    publishedUrl: page.publishedUrl,
    keywords: page.keywords.map(planKeyword),
    // Pagina locale con molte città (T-7001): il numero delle sue keyword, che sono le città.
    ...(hasLocalTips(page) ? { cities: page.keywords.length } : {}),
  };
}

/** Keyword al massimo in una risposta di get_plan (T-8201, D-70): sotto il limite di output di Claude Code. */
const PLAN_ANSWER_KEYWORDS = 1000;

/** Cursore di get_plan: piano, version e primo pezzo della risposta successiva, letto con uno schema stretto (CWE-770). */
const planCursorSchema = z
  .object({ strategyId: z.string().min(1).max(64), version: z.number().int().min(0), next: z.number().int().min(1) })
  .strict();
type PlanCursor = z.infer<typeof planCursorSchema>;

const invalidCursor = () => new AppError(400, "VALIDATION_ERROR", "Cursore di get_plan non valido", { field: "cursor" });

const encodeCursor = (cursor: PlanCursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");

function decodeCursor(text: string): PlanCursor {
  try {
    return planCursorSchema.parse(JSON.parse(Buffer.from(text, "base64url").toString("utf8")));
  } catch {
    throw invalidCursor();
  }
}

/** Pezzi del piano nell'ordine di lettura: ogni pagina intera, poi le non assegnate a gruppi di PLAN_ANSWER_KEYWORDS. */
function planPieces(view: StrategyView) {
  const pages = view.hubs.flatMap((hub) => [hub.pillar, ...hub.spokes]).map(planPage);
  const unassigned = view.unassigned.map(planKeyword);
  const groups = Array.from({ length: Math.ceil(unassigned.length / PLAN_ANSWER_KEYWORDS) }, (_, index) =>
    unassigned.slice(index * PLAN_ANSWER_KEYWORDS, (index + 1) * PLAN_ANSWER_KEYWORDS)
  );
  return [
    ...pages.map((page) => ({ size: page.keywords.length, pages: [page], unassigned: [] })),
    ...groups.map((group) => ({ size: group.length, pages: [], unassigned: group })),
  ];
}

/** Fine della risposta che parte da start: pezzi interi fino a PLAN_ANSWER_KEYWORDS keyword, il primo anche se è più grande. */
function answerEnd(pieces: { size: number }[], start: number): number {
  let end = start;
  let size = 0;
  while (end < pieces.length && (end === start || size + pieces[end].size <= PLAN_ANSWER_KEYWORDS)) {
    size += pieces[end].size;
    end += 1;
  }
  return end;
}

export const getPlanTool = defineTool({
  name: "get_plan",
  description:
    "Read the current plan of a project in parts of up to about 1000 keywords: call get_plan again with nextCursor until nextCursor is null. Each answer has strategyId, version (pass it to edit_plan and update_page), grouping source and notice, totalPages and totalUnassigned, then whole pages in work order (number, kind HUB or SPOKE, hubPageId, H1, H2, content type, status TODO, WRITING or PUBLISHED, published URL, keywords with id, volume, score, role and angle flag; cities for a local page with many places) and, after the last page, the keywords not assigned to any page. STRATEGY_CONFLICT with currentVersion means the plan changed while you were reading it: start again without cursor. STRATEGY_NOT_FOUND when the project has no plan yet: build it with build_plan.",
  input: z
    .object({
      projectId: projectIdField,
      cursor: z.string().min(1).max(200).optional().describe("nextCursor of the previous get_plan answer; omit it to start from the first page"),
    })
    .strict(),
  async run({ projectId, cursor }, { user, recordProject }) {
    const project = await requireProjectAccess(user, projectId, "project.read", {});
    recordProject(project.id);
    const from = cursor === undefined ? null : decodeCursor(cursor);
    const view = await readStrategy(project.id, await currentPlanId(project.id));
    // Una lettura non mescola due versioni del piano (CWE-362): con un piano cambiato o rigenerato si ricomincia.
    if (from && (from.strategyId !== view.id || from.version !== view.version)) {
      throw new AppError(409, "STRATEGY_CONFLICT", "La strategia è stata modificata nel frattempo", { currentVersion: view.version });
    }
    const pieces = planPieces(view);
    const start = from?.next ?? 0;
    if (from && start >= pieces.length) throw invalidCursor();
    const end = answerEnd(pieces, start);
    const answer = pieces.slice(start, end);
    return {
      strategyId: view.id,
      name: view.name,
      version: view.version,
      groupingSource: view.groupingSource,
      groupingNotice: view.groupingNotice,
      totalPages: pieces.filter((piece) => piece.pages.length > 0).length,
      totalUnassigned: view.unassigned.length,
      pages: answer.flatMap((piece) => piece.pages),
      unassigned: answer.flatMap((piece) => piece.unassigned),
      nextCursor: end < pieces.length ? encodeCursor({ strategyId: view.id, version: view.version, next: end }) : null,
    };
  },
});

/**
 * 409 STRATEGY_CONFLICT con la version corrente del piano, perché Claude Code rilegga e riprovi (T-7502); gli altri
 * errori passano come sono.
 */
async function withCurrentVersion<T>(planId: string, change: () => Promise<T>): Promise<T> {
  try {
    return await change();
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "STRATEGY_CONFLICT") throw error;
    const plan = await prisma.strategy.findUnique({ where: { id: planId }, select: { version: true } });
    throw new AppError(409, error.code, error.message, plan ? { currentVersion: plan.version } : undefined);
  }
}

export const editPlanTool = defineTool({
  name: "edit_plan",
  description:
    "Change the structure of the current plan with one operation, passing the version you last read: move_keywords (keywordIds to targetPageId, null to unassign them), merge_pages (sourcePageId into targetPageId), move_page (a spoke under another hub, targetHubId), promote_to_hub (a spoke becomes a hub), create_page (a new page from keywordIds, the first is its main keyword, under hubPageId or as a hub with null, optional h1 and contentType), keep_angle (keep keywordIds as headings of their page). Pages that are not To write are locked: taking keywords out of them, merging, moving or promoting them is AGENT_PAGE_LOCKED and the plan does not change. Pages cannot be deleted. Answers with the new version (and pageId for create_page); STRATEGY_CONFLICT gives currentVersion: read the plan again with get_plan and retry.",
  input: z
    .object({
      projectId: projectIdField,
      version: versionField,
      operation: z.discriminatedUnion("type", [
        OPERATION_SCHEMAS.moveKeywords,
        OPERATION_SCHEMAS.mergePages,
        OPERATION_SCHEMAS.movePage,
        OPERATION_SCHEMAS.promoteToHub,
        OPERATION_SCHEMAS.createPage,
        OPERATION_SCHEMAS.keepAngle,
      ]),
    })
    .strict(),
  async run({ projectId, version, operation }, { user, recordProject }) {
    const project = await requireProjectAccess(user, projectId, "strategy.write", {});
    recordProject(project.id);
    const planId = await currentPlanId(project.id);
    const result = await withCurrentVersion(planId, () => operateOnStrategy(user, project.id, planId, { version, operation }, guardAgentOperation));
    return { strategyId: planId, ...result };
  },
});

export const updatePageTool = defineTool({
  name: "update_page",
  description:
    "Change one page of the current plan, passing the version you last read: h1, h2 (the full list of headings), contentType, status (TODO, WRITING or PUBLISHED) and publishedUrl (absolute https address of the published page). On a page that is not To write only status and publishedUrl can change: the rest is AGENT_PAGE_LOCKED. Answers with the new version; STRATEGY_CONFLICT gives currentVersion.",
  input: z.object({ projectId: projectIdField, pageId: idField("Page id from get_plan"), ...PAGE_PATCH_SHAPE, version: versionField }).strict(),
  async run({ projectId, pageId, ...patch }, { user, recordProject }) {
    const project = await requireProjectAccess(user, projectId, "strategy.write", {});
    recordProject(project.id);
    const planId = await currentPlanId(project.id);
    const version = await withCurrentVersion(planId, () => patchStrategyPage(user, project.id, planId, pageId, patch, guardAgentPagePatch));
    return { strategyId: planId, pageId, version };
  },
});
