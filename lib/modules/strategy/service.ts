import { randomUUID } from "node:crypto";
import { z } from "zod";
import { expectOneRow, requireProjectAccess, type AuthorizedProject } from "@/lib/authz/workspace";
import type { Prisma } from "@/lib/generated/prisma/client";
import { AppError, ConflictError, ValidationError } from "@/lib/http/errors";
import { SectionNotFoundError } from "@/lib/modules/project-access";
import { buildResultsClauses } from "@/lib/modules/results-filters";
import { buildStrategyPlan, compareKeywordPriority } from "@/lib/modules/strategy/cluster";
import {
  applyOperation,
  applyPagePatch,
  type EditorState,
  type PagePatch,
  type StrategyOperation,
  UnknownStrategyItemError,
} from "@/lib/modules/strategy/editor";
import { AUTO_SETTINGS, expertSettingsSchema, resolveExpertSettings, type StrategySettings } from "@/lib/modules/strategy/rules";
import { buildPageTitles, MAX_TITLE_LENGTH, type TitleContext, type TitleKeyword } from "@/lib/modules/strategy/titles";
import { strategyTranslator } from "@/lib/modules/strategy/translator";
import {
  STRATEGY_CONTENT_TYPES,
  type PlanReason,
  type StrategyKeywordInput,
  type StrategyKeywordView,
  type StrategyMode,
  type StrategyPageView,
  type StrategySummaryView,
  type StrategyView,
} from "@/lib/modules/strategy/types";
import { prisma } from "@/lib/prisma";
import { lockWorkspaceRow } from "@/lib/workspaces/lock";

/** Limiti tecnici delle strategie (D-35): keyword per strategia e strategie per progetto. */
export const STRATEGY_MAX_KEYWORDS = 5000;
export const STRATEGY_LIMIT_PER_PROJECT = 20;
export const STRATEGY_NAME_MAX_LENGTH = 120;
const MAX_H2_ITEMS = 30;
const KEYWORD_INSERT_BATCH = 1000;
const TRANSACTION_TIMEOUT_MS = 30_000;

/** Strategia inesistente o di un altro progetto (CWE-639): stessa risposta. */
export class StrategyNotFoundError extends AppError {
  constructor() {
    super(404, "STRATEGY_NOT_FOUND", "Strategia non trovata");
    this.name = "StrategyNotFoundError";
  }
}

const idField = z.string().trim().min(1).max(64);
const versionField = z.number().int().min(0);

const generateSchema = z.object({
  mode: z.enum(["AUTO", "EXPERT"]),
  name: z.string().trim().max(STRATEGY_NAME_MAX_LENGTH).optional(),
  settings: z.unknown().optional(),
});

const renameSchema = z.object({ name: z.string().trim().min(1).max(STRATEGY_NAME_MAX_LENGTH), version: versionField });

const operationSchema = z.object({
  version: versionField,
  operation: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("move_keywords"),
      keywordIds: z.array(idField).min(1).max(STRATEGY_MAX_KEYWORDS),
      targetPageId: idField.nullable(),
    }),
    z.object({ type: z.literal("promote_to_hub"), pageId: idField }),
    z.object({ type: z.literal("merge_pages"), sourcePageId: idField, targetPageId: idField }),
    z.object({ type: z.literal("delete_page"), pageId: idField }),
  ]),
});

const titleField = z.string().trim().min(1).max(MAX_TITLE_LENGTH);
const pagePatchSchema = z
  .object({
    version: versionField,
    h1: titleField.optional(),
    h2: z.array(titleField).max(MAX_H2_ITEMS).optional(),
    contentType: z.enum(STRATEGY_CONTENT_TYPES).optional(),
  })
  .refine((value) => value.h1 !== undefined || value.h2 !== undefined || value.contentType !== undefined, {
    message: "nessun campo da modificare",
  });

function parseBody<T extends z.ZodType>(schema: T, body: unknown, what: string): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    throw new ValidationError(`${what} non valida (${field}${issue.message})`);
  }
  return parsed.data;
}

export type GenerateRequest = { mode: StrategyMode; name: string | null; settings: StrategySettings };

/** Corpo della generazione (T-1903): modalità, nome facoltativo e, per la modalità esperta, perimetro e regole. */
export function parseGenerateRequest(body: unknown): GenerateRequest {
  const parsed = parseBody(generateSchema, body, "Richiesta di generazione");
  const settings =
    parsed.mode === "EXPERT"
      ? resolveExpertSettings(parseBody(expertSettingsSchema, parsed.settings ?? {}, "Impostazioni della strategia"))
      : AUTO_SETTINGS;
  return { mode: parsed.mode, name: parsed.name || null, settings };
}

export const parseRenameRequest = (body: unknown) => parseBody(renameSchema, body, "Rinomina");
export const parseOperationRequest = (body: unknown) =>
  parseBody(operationSchema, body, "Operazione") as { version: number; operation: StrategyOperation };
export const parsePagePatchRequest = (body: unknown) =>
  parseBody(pagePatchSchema, body, "Modifica della pagina") as PagePatch & { version: number };

const PERIMETER_SELECT = {
  id: true,
  keyword: true,
  canonical_keyword: true,
  avg_monthly_searches: true,
  score: true,
  score_source: true,
  search_intent: true,
  keyword_type: true,
  is_question: true,
  is_local_intent: true,
} satisfies Prisma.KeywordCandidateSelect;

/**
 * Keyword del perimetro (T-1903): mai le rifiutate né i brand esclusi; sezione, volume minimo, intento e tipo con le
 * clausole dei filtri dei risultati. Ordinate per priorità, una per forma canonica, al massimo 5000 (D-35).
 */
async function loadPerimeter(projectId: string, settings: StrategySettings) {
  const rows = await prisma.keywordCandidate.findMany({
    where: {
      AND: [
        ...buildResultsClauses(
          projectId,
          {
            minVolume: settings.minVolume ?? undefined,
            searchIntent: settings.searchIntent ?? undefined,
            keywordType: settings.keywordType ?? undefined,
          },
          settings.sectionId
        ),
        settings.reviewStatus === "approved"
          ? { review_status: "approved" }
          : { review_status: { in: ["approved", "pending"] } },
        { brand_status: { not: "excluded" } },
      ],
    },
    select: PERIMETER_SELECT,
  });

  const inputs: StrategyKeywordInput[] = rows
    .map((row) => ({
      sourceId: row.id,
      keyword: row.keyword,
      canonical: row.canonical_keyword,
      volume: row.avg_monthly_searches,
      score: row.score,
      scoreSource: row.score_source,
      searchIntent: row.search_intent,
      keywordType: row.keyword_type,
      isQuestion: row.is_question,
      isLocal: row.is_local_intent,
    }))
    .sort(compareKeywordPriority);
  const seen = new Set<string>();
  const unique = inputs.filter((input) => !seen.has(input.canonical) && seen.add(input.canonical));
  return { keywords: unique.slice(0, STRATEGY_MAX_KEYWORDS), truncated: unique.length > STRATEGY_MAX_KEYWORDS };
}

function titleContext(language: string): TitleContext {
  return { language, year: new Date().getUTCFullYear(), translate: strategyTranslator(language) };
}

const strategyLimitError = () => new ConflictError("Limite di strategie del progetto raggiunto", "STRATEGY_LIMIT");

/**
 * Genera e salva una strategia (T-1903): perimetro, piano (T-1901), titoli (T-1902) e salvataggio in una transazione,
 * sotto il lock del workspace perché due generazioni contemporanee non superino il limite di 20 (CWE-362).
 */
export async function generateStrategy(
  user: { id: string },
  projectId: string,
  request: GenerateRequest,
  defaultName: string
): Promise<string> {
  const project = await requireProjectAccess(user, projectId, "strategy.write", { language_code: true });
  if ((await prisma.strategy.count({ where: { project_id: project.id } })) >= STRATEGY_LIMIT_PER_PROJECT) {
    throw strategyLimitError();
  }

  const { settings } = request;
  let language = project.language_code;
  if (settings.sectionId) {
    const section = await prisma.subproject.findFirst({
      where: { id: settings.sectionId, project_id: project.id },
      select: { language_code_override: true },
    });
    if (!section) throw new SectionNotFoundError();
    language = section.language_code_override ?? language;
  }

  const [{ keywords, truncated }, seeds] = await Promise.all([
    loadPerimeter(project.id, settings),
    prisma.seed.findMany({
      where: { project_id: project.id, ...(settings.sectionId ? { subproject_id: settings.sectionId } : {}) },
      select: { keyword: true },
    }),
  ]);
  if (keywords.length === 0) {
    throw new ConflictError("Nessuna keyword nel perimetro della strategia", "STRATEGY_NO_KEYWORDS");
  }

  const plan = buildStrategyPlan({ keywords, seeds: seeds.map((seed) => seed.keyword), language, rules: settings.rules });
  const byCanonical = new Map(keywords.map((keyword) => [keyword.canonical, keyword]));
  const asTitle = (canonical: string): TitleKeyword => {
    const keyword = byCanonical.get(canonical)!;
    return { keyword: keyword.keyword, canonical, isQuestion: keyword.isQuestion };
  };
  const context = titleContext(language);

  const strategyId = randomUUID();
  const pageIds = new Map(plan.pages.map((page) => [page.ref, randomUUID()]));
  const pageRows = plan.pages.map((page) => {
    const titles = buildPageTitles(
      {
        kind: page.kind,
        contentType: page.contentType,
        main: asTitle(page.main),
        secondary: page.secondary.map(asTitle),
        spokeMains:
          page.kind === "HUB" ? plan.pages.filter((spoke) => spoke.hubRef === page.ref).map((spoke) => asTitle(spoke.main)) : undefined,
      },
      context
    );
    return {
      id: pageIds.get(page.ref)!,
      strategy_id: strategyId,
      kind: page.kind,
      hub_page_id: page.hubRef ? pageIds.get(page.hubRef)! : null,
      h1: titles.h1,
      h2: titles.h2,
      content_type: page.contentType,
      priority: page.priority,
      position: page.position,
      reason_code: page.reason.code,
      reason_params: page.reason.params,
    };
  });

  const placement = new Map<string, { pageId: string; role: "MAIN" | "SECONDARY" }>();
  for (const page of plan.pages) {
    const pageId = pageIds.get(page.ref)!;
    placement.set(page.main, { pageId, role: "MAIN" });
    for (const canonical of page.secondary) placement.set(canonical, { pageId, role: "SECONDARY" });
  }
  const keywordRows = keywords.map((keyword) => ({
    strategy_id: strategyId,
    page_id: placement.get(keyword.canonical)?.pageId ?? null,
    role: placement.get(keyword.canonical)?.role ?? "SECONDARY",
    keyword: keyword.keyword,
    canonical_keyword: keyword.canonical,
    volume: keyword.volume,
    score: keyword.score,
    score_source: keyword.scoreSource,
    search_intent: keyword.searchIntent,
    keyword_type: keyword.keywordType,
    is_question: keyword.isQuestion,
    is_local: keyword.isLocal,
    source_keyword_id: keyword.sourceId,
  }));

  await prisma.$transaction(
    async (tx) => {
      await lockWorkspaceRow(tx, project.workspace_id);
      if ((await tx.strategy.count({ where: { project_id: project.id } })) >= STRATEGY_LIMIT_PER_PROJECT) {
        throw strategyLimitError();
      }
      await tx.strategy.create({
        data: {
          id: strategyId,
          project_id: project.id,
          name: request.name ?? defaultName,
          created_by_user_id: user.id,
          mode: request.mode,
          settings,
          language,
          considered_count: keywords.length,
          assigned_count: keywords.length - plan.unassigned.length,
          unassigned_count: plan.unassigned.length,
          truncated,
        },
      });
      // Prima gli hub, poi gli spoke che li citano.
      await tx.strategyPage.createMany({ data: pageRows.filter((page) => page.kind === "HUB") });
      await tx.strategyPage.createMany({ data: pageRows.filter((page) => page.kind === "SPOKE") });
      for (let start = 0; start < keywordRows.length; start += KEYWORD_INSERT_BATCH) {
        await tx.strategyKeyword.createMany({ data: keywordRows.slice(start, start + KEYWORD_INSERT_BATCH) });
      }
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );
  return strategyId;
}

const SUMMARY_SELECT = {
  id: true,
  name: true,
  mode: true,
  language: true,
  created_at: true,
  considered_count: true,
  assigned_count: true,
  unassigned_count: true,
  truncated: true,
  version: true,
} satisfies Prisma.StrategySelect;

function toSummary(row: Prisma.StrategyGetPayload<{ select: typeof SUMMARY_SELECT }>): StrategySummaryView {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode,
    language: row.language,
    createdAt: row.created_at.toISOString(),
    consideredCount: row.considered_count,
    assignedCount: row.assigned_count,
    unassignedCount: row.unassigned_count,
    truncated: row.truncated,
    version: row.version,
  };
}

/** Strategie di un progetto già autorizzato, dalla più recente. */
export async function listStrategies(projectId: string): Promise<StrategySummaryView[]> {
  const rows = await prisma.strategy.findMany({
    where: { project_id: projectId },
    orderBy: [{ created_at: "desc" }, { id: "asc" }],
    select: SUMMARY_SELECT,
  });
  return rows.map(toSummary);
}

const RECORD_SELECT = {
  ...SUMMARY_SELECT,
  project_id: true,
  settings: true,
  pages: {
    select: {
      id: true,
      kind: true,
      hub_page_id: true,
      h1: true,
      h2: true,
      h1_edited: true,
      h2_edited: true,
      content_type: true,
      priority: true,
      position: true,
      reason_code: true,
      reason_params: true,
    },
  },
  keywords: {
    select: {
      id: true,
      page_id: true,
      role: true,
      keyword: true,
      canonical_keyword: true,
      volume: true,
      score: true,
      is_question: true,
    },
  },
} satisfies Prisma.StrategySelect;

type StrategyRecord = Prisma.StrategyGetPayload<{ select: typeof RECORD_SELECT }>;

async function findRecord(client: Prisma.TransactionClient, projectId: string, strategyId: string): Promise<StrategyRecord> {
  const record = await client.strategy.findFirst({ where: { id: strategyId, project_id: projectId }, select: RECORD_SELECT });
  if (!record) throw new StrategyNotFoundError();
  return record;
}

function toEditorState(record: StrategyRecord): EditorState {
  return {
    pages: record.pages.map((page) => ({
      id: page.id,
      kind: page.kind,
      hubPageId: page.hub_page_id,
      h1: page.h1,
      h2: page.h2 ?? [],
      h1Edited: page.h1_edited,
      h2Edited: page.h2_edited,
      contentType: page.content_type,
      priority: page.priority,
      position: page.position,
      reason: { code: page.reason_code, params: page.reason_params } as PlanReason,
    })),
    keywords: record.keywords.map((keyword) => ({
      id: keyword.id,
      pageId: keyword.page_id,
      role: keyword.role,
      keyword: keyword.keyword,
      canonical: keyword.canonical_keyword,
      volume: keyword.volume,
      score: keyword.score,
      isQuestion: keyword.is_question,
    })),
  };
}

function keywordView({ pageId: _pageId, ...keyword }: EditorState["keywords"][number]): StrategyKeywordView {
  return keyword;
}

/** Vista della strategia: hub nell'ordine di lavoro (position), principale per prima e secondarie per priorità. */
function toView(record: StrategyRecord): StrategyView {
  const state = toEditorState(record);
  const keywordsOf = (pageId: string | null) =>
    state.keywords
      .filter((keyword) => keyword.pageId === pageId)
      .sort((a, b) => Number(b.role === "MAIN") - Number(a.role === "MAIN") || compareKeywordPriority(a, b))
      .map(keywordView);
  const pages = [...state.pages].sort((a, b) => a.position - b.position);
  const pageView = (page: EditorState["pages"][number]): StrategyPageView => ({ ...page, keywords: keywordsOf(page.id) });
  const hubIds = new Set(pages.filter((page) => page.kind === "HUB").map((page) => page.id));

  return {
    ...toSummary(record),
    projectId: record.project_id,
    settings: record.settings,
    hubs: pages
      .filter((page) => page.kind === "HUB" || !page.hubPageId || !hubIds.has(page.hubPageId))
      .map((pillar) => ({
        pillar: pageView(pillar),
        spokes: pages.filter((page) => page.hubPageId === pillar.id && page.kind === "SPOKE").map(pageView),
      })),
    unassigned: keywordsOf(null),
  };
}

/** Strategia completa di un progetto già autorizzato; 404 STRATEGY_NOT_FOUND se non è del progetto. */
export async function readStrategy(projectId: string, strategyId: string): Promise<StrategyView> {
  return toView(await findRecord(prisma, projectId, strategyId));
}

/**
 * Incrementa la version solo se coincide con quella inviata (T-1904): la riga resta bloccata fino alla fine della
 * transazione, quindi una modifica contemporanea con la stessa version trova la nuova e riceve 409 (CWE-362).
 */
async function claimVersion(
  tx: Prisma.TransactionClient,
  project: AuthorizedProject,
  strategyId: string,
  version: number,
  data: Prisma.StrategyUpdateManyMutationInput = {}
): Promise<void> {
  const { count } = await tx.strategy.updateMany({
    where: { id: strategyId, project_id: project.id, version, project: project.perimeter },
    data: { ...data, version: { increment: 1 } },
  });
  if (count === 1) return;
  const exists = await tx.strategy.count({ where: { id: strategyId, project_id: project.id, project: project.perimeter } });
  throw exists ? new ConflictError("La strategia è stata modificata nel frattempo", "STRATEGY_CONFLICT") : new StrategyNotFoundError();
}

/** Scrive le differenze tra due stati del piano: prima le keyword (le nuove principali per ultime), poi le pagine. */
async function persistState(tx: Prisma.TransactionClient, strategyId: string, before: EditorState, after: EditorState) {
  const previous = new Map(before.keywords.map((keyword) => [keyword.id, keyword]));
  const changed = after.keywords.filter((keyword) => {
    const old = previous.get(keyword.id)!;
    return old.pageId !== keyword.pageId || old.role !== keyword.role;
  });
  // Indice unico parziale della principale: prima tutte le keyword cambiate come secondarie, poi le nuove principali.
  const byPage = new Map<string | null, string[]>();
  for (const keyword of changed) byPage.set(keyword.pageId, [...(byPage.get(keyword.pageId) ?? []), keyword.id]);
  for (const [pageId, ids] of byPage) {
    await tx.strategyKeyword.updateMany({
      where: { strategy_id: strategyId, id: { in: ids } },
      data: { page_id: pageId, role: "SECONDARY" },
    });
  }
  const newMains = changed.filter((keyword) => keyword.role === "MAIN").map((keyword) => keyword.id);
  if (newMains.length > 0) {
    await tx.strategyKeyword.updateMany({ where: { strategy_id: strategyId, id: { in: newMains } }, data: { role: "MAIN" } });
  }

  const remaining = new Map(after.pages.map((page) => [page.id, page]));
  for (const old of before.pages) {
    const page = remaining.get(old.id);
    if (!page) continue;
    const same =
      old.kind === page.kind &&
      old.hubPageId === page.hubPageId &&
      old.h1 === page.h1 &&
      old.h2.join("\n") === page.h2.join("\n") &&
      old.h1Edited === page.h1Edited &&
      old.h2Edited === page.h2Edited &&
      old.contentType === page.contentType &&
      old.priority === page.priority;
    if (same) continue;
    await tx.strategyPage.updateMany({
      where: { strategy_id: strategyId, id: page.id },
      data: {
        kind: page.kind,
        hub_page_id: page.hubPageId,
        h1: page.h1,
        h2: page.h2,
        h1_edited: page.h1Edited,
        h2_edited: page.h2Edited,
        content_type: page.contentType,
        priority: page.priority,
      },
    });
  }
  const removed = before.pages.filter((page) => !remaining.has(page.id)).map((page) => page.id);
  if (removed.length > 0) {
    await tx.strategyPage.deleteMany({ where: { strategy_id: strategyId, id: { in: removed } } });
  }

  const assigned = after.keywords.filter((keyword) => keyword.pageId !== null).length;
  return { assigned_count: assigned, unassigned_count: after.keywords.length - assigned };
}

/** Modifica del piano con controllo della version (T-1904); restituisce la nuova version. */
async function mutatePlan(
  user: { id: string },
  projectId: string,
  strategyId: string,
  version: number,
  mutate: (state: EditorState, context: TitleContext) => EditorState
): Promise<number> {
  const project = await requireProjectAccess(user, projectId, "strategy.write", {});
  await prisma.$transaction(
    async (tx) => {
      await claimVersion(tx, project, strategyId, version);
      const record = await findRecord(tx, project.id, strategyId);
      const before = toEditorState(record);
      let after: EditorState;
      try {
        after = mutate(before, titleContext(record.language));
      } catch (error) {
        throw error instanceof UnknownStrategyItemError ? new StrategyNotFoundError() : error;
      }
      const counts = await persistState(tx, strategyId, before, after);
      const { count } = await tx.strategy.updateMany({
        where: { id: strategyId, project_id: project.id, project: project.perimeter },
        data: counts,
      });
      expectOneRow(count, () => new StrategyNotFoundError());
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );
  return version + 1;
}

export function operateOnStrategy(user: { id: string }, projectId: string, strategyId: string, body: unknown): Promise<number> {
  const { version, operation } = parseOperationRequest(body);
  return mutatePlan(user, projectId, strategyId, version, (state, context) => applyOperation(state, operation, context));
}

export function patchStrategyPage(
  user: { id: string },
  projectId: string,
  strategyId: string,
  pageId: string,
  body: unknown
): Promise<number> {
  const { version, ...patch } = parsePagePatchRequest(body);
  return mutatePlan(user, projectId, strategyId, version, (state, context) => applyPagePatch(state, pageId, patch, context));
}

/** Rinomina con controllo della version (T-1903). */
export async function renameStrategy(user: { id: string }, projectId: string, strategyId: string, body: unknown): Promise<number> {
  const { name, version } = parseRenameRequest(body);
  const project = await requireProjectAccess(user, projectId, "strategy.write", {});
  await prisma.$transaction((tx) => claimVersion(tx, project, strategyId, version, { name }));
  return version + 1;
}

export async function deleteStrategy(user: { id: string }, projectId: string, strategyId: string): Promise<void> {
  const project = await requireProjectAccess(user, projectId, "strategy.write", {});
  const { count } = await prisma.strategy.deleteMany({
    where: { id: strategyId, project_id: project.id, project: project.perimeter },
  });
  expectOneRow(count, () => new StrategyNotFoundError());
}
