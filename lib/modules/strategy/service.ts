import { randomUUID } from "node:crypto";
import { z } from "zod";
import { expectOneRow, requireProjectAccess, type AuthorizedProject } from "@/lib/authz/workspace";
import { Prisma } from "@/lib/generated/prisma/client";
import { AppError, ConflictError, ValidationError } from "@/lib/http/errors";
import { KEPT_WHERE } from "@/lib/modules/keep-rule";
import { SectionNotFoundError } from "@/lib/modules/project-access";
import { buildResultsClauses } from "@/lib/modules/results-filters";
import { buildStrategyPlan, compareKeywordPriority } from "@/lib/modules/strategy/cluster";
import {
  applyOperation,
  applyPagePatch,
  type EditorState,
  type PagePatch,
  type StrategyOperation,
  titlePageOf,
  UnknownStrategyItemError,
} from "@/lib/modules/strategy/editor";
import { AUTO_SETTINGS, expertSettingsSchema, resolveExpertSettings, type StrategySettings } from "@/lib/modules/strategy/rules";
import {
  buildPageTitles,
  MAX_TITLE_LENGTH,
  planTitlePage,
  type TitleContext,
  type TitleKeyword,
  type TitlePage,
} from "@/lib/modules/strategy/titles";
import { strategyTranslator } from "@/lib/modules/strategy/translator";
import {
  STRATEGY_CONTENT_TYPES,
  STRATEGY_PAGE_STATUSES,
  type PlanAnchor,
  type PlanReason,
  type StrategyAiProposal,
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
  regenerate: z.boolean().optional(),
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
    z.object({ type: z.literal("move_page"), pageId: idField, targetHubId: idField }),
  ]),
});

const titleField = z.string().trim().min(1).max(MAX_TITLE_LENGTH);
const pagePatchSchema = z
  .object({
    version: versionField,
    h1: titleField.optional(),
    h2: z.array(titleField).max(MAX_H2_ITEMS).optional(),
    contentType: z.enum(STRATEGY_CONTENT_TYPES).optional(),
    status: z.enum(STRATEGY_PAGE_STATUSES).optional(),
  })
  .refine(
    (value) => value.h1 !== undefined || value.h2 !== undefined || value.contentType !== undefined || value.status !== undefined,
    { message: "nessun campo da modificare" }
  );

function parseBody<T extends z.ZodType>(schema: T, body: unknown, what: string): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    throw new ValidationError(`${what} non valida (${field}${issue.message})`);
  }
  return parsed.data;
}

export type GenerateRequest = { mode: StrategyMode; name: string | null; settings: StrategySettings; regenerate: boolean };

/**
 * Corpo della generazione (T-1903): modalità, nome facoltativo e, per la modalità esperta, perimetro e regole;
 * regenerate true rigenera il piano senza toccare le pagine iniziate (T-2502).
 */
export function parseGenerateRequest(body: unknown): GenerateRequest {
  const parsed = parseBody(generateSchema, body, "Richiesta di generazione");
  const settings =
    parsed.mode === "EXPERT"
      ? resolveExpertSettings(parseBody(expertSettingsSchema, parsed.settings ?? {}, "Impostazioni della strategia"))
      : AUTO_SETTINGS;
  return { mode: parsed.mode, name: parsed.name || null, settings, regenerate: parsed.regenerate ?? false };
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
 * Keyword del perimetro (T-1903): le tenute (regola unica di T-2401, quindi anche una keyword di marchio tenuta a mano),
 * oppure le sole approvate nella modalità esperta, mai le scartate; sezione, volume minimo, intento e tipo con le
 * clausole dei filtri dei risultati. Ordinate per priorità, una per forma canonica, al massimo limit (5000, D-35, meno
 * le keyword copiate dalle pagine iniziate); le forme canoniche di exclude (già nelle pagine iniziate, T-2502) restano fuori.
 */
async function loadPerimeter(projectId: string, settings: StrategySettings, exclude: Set<string>, limit: number) {
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
        settings.reviewStatus === "approved" ? { review_status: "approved" } : KEPT_WHERE,
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
  const seen = new Set<string>(exclude);
  const unique = inputs.filter((input) => !seen.has(input.canonical) && seen.add(input.canonical));
  return { keywords: unique.slice(0, limit), truncated: unique.length > limit };
}

/** Il piano del progetto è la sua strategia più recente (T-2502); a parità di istante decide l'id. */
const PLAN_ORDER = [{ created_at: "desc" }, { id: "asc" }] satisfies Prisma.StrategyOrderByWithRelationInput[];

const COPY_PAGE_SELECT = {
  id: true,
  kind: true,
  hub_page_id: true,
  h1: true,
  h2: true,
  h1_edited: true,
  h2_edited: true,
  content_type: true,
  priority: true,
  reason_code: true,
  reason_params: true,
  status: true,
  status_changed_at: true,
} satisfies Prisma.StrategyPageSelect;

const COPY_KEYWORD_SELECT = {
  page_id: true,
  role: true,
  keyword: true,
  canonical_keyword: true,
  volume: true,
  score: true,
  score_source: true,
  search_intent: true,
  keyword_type: true,
  is_question: true,
  is_local: true,
  source_keyword_id: true,
} satisfies Prisma.StrategyKeywordSelect;

type LockedPage = Prisma.StrategyPageGetPayload<{ select: typeof COPY_PAGE_SELECT }>;
type LockedKeyword = Prisma.StrategyKeywordGetPayload<{ select: typeof COPY_KEYWORD_SELECT }>;
type LockedPlan = { planId: string | null; pages: LockedPage[]; keywords: LockedKeyword[] };

/**
 * Pagine bloccate del piano corrente (T-2502): le pagine in scrittura o pubblicate più gli hub con almeno uno spoke
 * bloccato (hub ancorati), con le loro keyword. Senza piano, nessuna pagina.
 */
async function loadLockedPages(projectId: string): Promise<LockedPlan> {
  const plan = await prisma.strategy.findFirst({
    where: { project_id: projectId },
    orderBy: PLAN_ORDER,
    select: { id: true, pages: { select: COPY_PAGE_SELECT }, keywords: { where: { page_id: { not: null } }, select: COPY_KEYWORD_SELECT } },
  });
  if (!plan) return { planId: null, pages: [], keywords: [] };
  const lockedIds = new Set<string>();
  for (const page of plan.pages.filter((item) => item.status !== "TODO")) {
    lockedIds.add(page.id);
    if (page.kind === "SPOKE" && page.hub_page_id) lockedIds.add(page.hub_page_id);
  }
  return {
    planId: plan.id,
    pages: plan.pages.filter((page) => lockedIds.has(page.id)),
    keywords: plan.keywords.filter((keyword) => keyword.page_id !== null && lockedIds.has(keyword.page_id)),
  };
}

type PageRow = Prisma.StrategyPageCreateManyInput & { id: string; hub_page_id: string | null };
type KeywordRow = Prisma.StrategyKeywordCreateManyInput & { id: string; page_id: string | null };

// Massimo della colonna Int di Postgres (CWE-190).
const INT4_MAX = 2_147_483_647;

/**
 * Ordine di lavoro del piano rigenerato (T-2502), con la regola del motore (T-1901): hub per volume complessivo
 * (pilastro più spoke), ciascuno seguito dai propri spoke per priorità; a parità decide la keyword principale.
 */
function assignWorkOrder(pages: PageRow[], keywords: KeywordRow[]): void {
  const mainOf = new Map(keywords.filter((row) => row.role === "MAIN").map((row) => [row.page_id, row.canonical_keyword]));
  const byPriority = (a: PageRow, b: PageRow, total: (page: PageRow) => number) =>
    total(b) - total(a) || ((mainOf.get(a.id) ?? "") < (mainOf.get(b.id) ?? "") ? -1 : 1);
  const spokesOf = (hubId: string) =>
    pages.filter((page) => page.hub_page_id === hubId).sort((a, b) => byPriority(a, b, (page) => page.priority));
  const hubTotal = (hub: PageRow) => spokesOf(hub.id).reduce((sum, spoke) => sum + spoke.priority, hub.priority);
  let position = 0;
  for (const hub of pages.filter((page) => page.hub_page_id === null).sort((a, b) => byPriority(a, b, hubTotal))) {
    hub.position = position++;
    for (const spoke of spokesOf(hub.id)) spoke.position = position++;
  }
}

/**
 * H2 suggeriti e priorità di un hub ancorato ancora da scrivere (T-2502): riceve le keyword nuove della pilastro e gli
 * spoke nuovi, quindi gli H2 non modificati si ricalcolano come nell'editor (T-1904); un hub già iniziato resta com'è.
 */
function refreshAnchoredHubs(locked: LockedPage[], pages: PageRow[], keywords: KeywordRow[], idOf: Map<string, string>, context: TitleContext) {
  const usesVolume = keywords.some((row) => row.volume !== null);
  const sortedKeywordsOf = (pageId: string) =>
    keywords
      .filter((row) => row.page_id === pageId)
      .map((row) => ({ row, volume: row.volume ?? null, score: row.score ?? null, canonical: row.canonical_keyword }))
      .sort(compareKeywordPriority)
      .map((item) => item.row);
  const asTitle = (row: KeywordRow): TitleKeyword => ({ keyword: row.keyword, canonical: row.canonical_keyword, isQuestion: row.is_question });
  const mainOf = (pageId: string) => keywords.find((row) => row.page_id === pageId && row.role === "MAIN");

  for (const original of locked.filter((page) => page.kind === "HUB" && page.status === "TODO")) {
    const hub = pages.find((page) => page.id === idOf.get(original.id))!;
    const own = sortedKeywordsOf(hub.id);
    const total = own.reduce((sum, row) => sum + (usesVolume ? (row.volume ?? 0) : (row.score ?? 0)), 0);
    hub.priority = Math.min(INT4_MAX, Math.round(total));
    if (original.h2_edited) continue;
    const main = own.find((row) => row.role === "MAIN") ?? own[0];
    const spokeMains = pages
      .filter((page) => page.hub_page_id === hub.id)
      .map((page) => ({ page, main: mainOf(page.id)! }))
      .sort((a, b) => b.page.priority - a.page.priority || (a.main.canonical_keyword < b.main.canonical_keyword ? -1 : 1))
      .map((spoke) => asTitle(spoke.main));
    hub.h2 = buildPageTitles(
      {
        kind: "HUB",
        contentType: original.content_type,
        main: asTitle(main),
        secondary: own.filter((row) => row !== main).map(asTitle),
        spokeMains,
      },
      context
    ).h2;
  }
}

function titleContext(language: string, country: string | null): TitleContext {
  return { language, year: new Date().getUTCFullYear(), translate: strategyTranslator(language, country) };
}

/**
 * Paese di una strategia salvata (T-5101, T-5102): quello della sezione del perimetro se lo sovrascrive, altrimenti
 * quello del progetto, come alla generazione; sceglie il catalogo dei titoli e la variante dello spagnolo.
 */
async function strategyCountry(client: Prisma.TransactionClient, record: StrategyRecord): Promise<string> {
  const { sectionId } = (record.settings ?? {}) as { sectionId?: string | null };
  const section = sectionId
    ? await client.subproject.findFirst({ where: { id: sectionId, project_id: record.project_id }, select: { country_code_override: true } })
    : null;
  if (section?.country_code_override) return section.country_code_override;
  const project = await client.project.findUniqueOrThrow({ where: { id: record.project_id }, select: { country_code: true } });
  return project.country_code;
}

const strategyLimitError = () => new ConflictError("Limite di strategie del progetto raggiunto", "STRATEGY_LIMIT");

/**
 * Oltre il limite di 20 la rigenerazione elimina le strategie più vecchie, mai il piano corrente (T-2502, D-35
 * emendata): si legge sotto il lock del workspace, nella transazione che salva la strategia nuova.
 */
async function pruneOldestVersions(tx: Prisma.TransactionClient, project: AuthorizedProject, count: number): Promise<void> {
  const plan = await tx.strategy.findFirst({ where: { project_id: project.id }, orderBy: PLAN_ORDER, select: { id: true } });
  const oldest = await tx.strategy.findMany({
    where: { project_id: project.id, ...(plan ? { id: { not: plan.id } } : {}) },
    orderBy: [{ created_at: "asc" }, { id: "desc" }],
    take: count,
    select: { id: true },
  });
  await tx.strategy.deleteMany({
    where: { id: { in: oldest.map((row) => row.id) }, project_id: project.id, project: project.perimeter },
  });
}

/**
 * Genera e salva una strategia (T-1903): perimetro, piano (T-1901), titoli (T-1902) e salvataggio in una transazione,
 * sotto il lock del workspace perché due generazioni contemporanee non superino il limite di 20 (CWE-362).
 * Con regenerate (T-2502) la strategia nuova diventa il piano senza perdere il lavoro iniziato: copia le pagine
 * bloccate del piano corrente (in scrittura, pubblicate e i loro hub) con titoli, tipo, stato e keyword, porta i loro
 * articoli sulle copie con blocchi e lavori (T-4002), ricostruisce le altre dalle keyword tenute meno quelle già
 * copiate e, oltre 20 strategie, elimina la versione più vecchia.
 */
export async function generateStrategy(
  user: { id: string },
  projectId: string,
  request: GenerateRequest,
  defaultName: string
): Promise<string> {
  const project = await requireProjectAccess(user, projectId, "strategy.write", { language_code: true, country_code: true });
  if (!request.regenerate && (await prisma.strategy.count({ where: { project_id: project.id } })) >= STRATEGY_LIMIT_PER_PROJECT) {
    throw strategyLimitError();
  }

  const { settings } = request;
  let language = project.language_code;
  let country = project.country_code;
  if (settings.sectionId) {
    const section = await prisma.subproject.findFirst({
      where: { id: settings.sectionId, project_id: project.id },
      select: { language_code_override: true, country_code_override: true },
    });
    if (!section) throw new SectionNotFoundError();
    language = section.language_code_override ?? language;
    country = section.country_code_override ?? country;
  }

  const locked: LockedPlan = request.regenerate ? await loadLockedPages(project.id) : { planId: null, pages: [], keywords: [] };
  const [{ keywords, truncated }, seeds] = await Promise.all([
    loadPerimeter(
      project.id,
      settings,
      new Set(locked.keywords.map((keyword) => keyword.canonical_keyword)),
      Math.max(0, STRATEGY_MAX_KEYWORDS - locked.keywords.length)
    ),
    prisma.seed.findMany({
      where: { project_id: project.id, ...(settings.sectionId ? { subproject_id: settings.sectionId } : {}) },
      select: { keyword: true },
    }),
  ]);
  if (keywords.length === 0 && locked.pages.length === 0) {
    throw new ConflictError("Nessuna keyword nel perimetro della strategia", "STRATEGY_NO_KEYWORDS");
  }

  // Ogni hub bloccato è un'ancora: la sua keyword principale fa da seed e la pilastro accetta keyword solo da scrivere.
  const lockedMain = new Map(locked.keywords.filter((row) => row.role === "MAIN").map((row) => [row.page_id, row.canonical_keyword]));
  const anchors: PlanAnchor[] = locked.pages
    .filter((page) => page.kind === "HUB" && lockedMain.has(page.id))
    .map((page) => ({ ref: page.id, main: lockedMain.get(page.id)!, open: page.status === "TODO" }));
  const plan = buildStrategyPlan({ keywords, seeds: seeds.map((seed) => seed.keyword), language, rules: settings.rules, anchors });
  const byCanonical = new Map(keywords.map((keyword) => [keyword.canonical, keyword]));
  const asTitle = (canonical: string): TitleKeyword => {
    const keyword = byCanonical.get(canonical)!;
    return { keyword: keyword.keyword, canonical, isQuestion: keyword.isQuestion };
  };
  const context = titleContext(language, country);

  const strategyId = randomUUID();
  // Id delle pagine nuove: le copie delle pagine bloccate per id di origine, le pagine del motore per ref.
  const idOf = new Map<string, string>([
    ...locked.pages.map((page) => [page.id, randomUUID()] as const),
    ...plan.pages.map((page) => [page.ref, randomUUID()] as const),
  ]);
  const pageRows: PageRow[] = [
    ...locked.pages.map((page) => ({
      id: idOf.get(page.id)!,
      strategy_id: strategyId,
      kind: page.kind,
      hub_page_id: page.hub_page_id ? (idOf.get(page.hub_page_id) ?? null) : null,
      h1: page.h1,
      h2: page.h2,
      h1_edited: page.h1_edited,
      h2_edited: page.h2_edited,
      content_type: page.content_type,
      priority: page.priority,
      position: 0,
      reason_code: page.reason_code,
      reason_params: page.reason_params as Prisma.InputJsonValue,
      status: page.status,
      status_changed_at: page.status_changed_at,
    })),
    ...plan.pages.map((page) => {
      const titles = buildPageTitles(planTitlePage(plan, page, asTitle), context);
      return {
        id: idOf.get(page.ref)!,
        strategy_id: strategyId,
        kind: page.kind,
        hub_page_id: page.hubRef ? idOf.get(page.hubRef)! : null,
        h1: titles.h1,
        h2: titles.h2,
        content_type: page.contentType,
        priority: page.priority,
        position: page.position,
        reason_code: page.reason.code,
        reason_params: page.reason.params,
      };
    }),
  ];

  const placement = new Map<string, { pageId: string; role: "MAIN" | "SECONDARY" }>();
  for (const page of plan.pages) {
    const pageId = idOf.get(page.ref)!;
    placement.set(page.main, { pageId, role: "MAIN" });
    for (const canonical of page.secondary) placement.set(canonical, { pageId, role: "SECONDARY" });
  }
  for (const { ref, secondary } of plan.anchored) {
    for (const canonical of secondary) placement.set(canonical, { pageId: idOf.get(ref)!, role: "SECONDARY" });
  }
  const keywordRows: KeywordRow[] = [
    ...locked.keywords.map(({ page_id: pageId, ...keyword }) => ({
      ...keyword,
      id: randomUUID(),
      strategy_id: strategyId,
      page_id: idOf.get(pageId!)!,
    })),
    ...keywords.map((keyword) => ({
      id: randomUUID(),
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
    })),
  ];
  if (locked.pages.length > 0) {
    refreshAnchoredHubs(locked.pages, pageRows, keywordRows, idOf, context);
    assignWorkOrder(pageRows, keywordRows);
  }

  await prisma.$transaction(
    async (tx) => {
      await lockWorkspaceRow(tx, project.workspace_id);
      const count = await tx.strategy.count({ where: { project_id: project.id } });
      if (count >= STRATEGY_LIMIT_PER_PROJECT) {
        if (!request.regenerate) throw strategyLimitError();
        await pruneOldestVersions(tx, project, count - STRATEGY_LIMIT_PER_PROJECT + 1);
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
          considered_count: keywordRows.length,
          assigned_count: keywordRows.length - plan.unassigned.length,
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
      // Gli articoli delle pagine copiate passano alle copie (T-4002): stessi blocchi e lavori, page_id resta unico.
      const articles = await tx.article.findMany({
        where: { page_id: { in: locked.pages.map((page) => page.id) }, project_id: project.id },
        select: { id: true, page_id: true },
      });
      for (const article of articles) {
        await tx.article.updateMany({ where: { id: article.id, project_id: project.id }, data: { page_id: idOf.get(article.page_id)! } });
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
  _count: { select: { pages: true } },
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
    pageCount: row._count.pages,
  };
}

/** Strategie di un progetto già autorizzato, dalla più recente: la prima è il piano, le altre le versioni (T-2502). */
export async function listStrategies(projectId: string): Promise<StrategySummaryView[]> {
  const rows = await prisma.strategy.findMany({ where: { project_id: projectId }, orderBy: PLAN_ORDER, select: SUMMARY_SELECT });
  return rows.map(toSummary);
}

/** Id del piano di un progetto già autorizzato (la strategia più recente, T-2502), null se non ne ha. */
export async function findPlanId(projectId: string, client: Prisma.TransactionClient = prisma): Promise<string | null> {
  const plan = await client.strategy.findFirst({ where: { project_id: projectId }, orderBy: PLAN_ORDER, select: { id: true } });
  return plan?.id ?? null;
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
      status: true,
      status_changed_at: true,
      ai_proposal: true,
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
      status: page.status,
      statusChangedAt: page.status_changed_at?.toISOString() ?? null,
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

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Proposta salvata nella pagina (T-3601) → vista; un valore senza la forma attesa non si mostra. Una proposta salvata
 * prima di T-3802 non ha droppedH2: vale 0.
 */
function toAiProposal(value: Prisma.JsonValue): StrategyAiProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { h1, h2, droppedH2, model, createdAt } = value;
  if (typeof h1 !== "string" || !isStringList(h2) || typeof model !== "string" || typeof createdAt !== "string") return null;
  return { h1, h2, droppedH2: isCount(droppedH2) ? droppedH2 : 0, model, createdAt };
}

/**
 * Vista della strategia: hub nell'ordine di lavoro (position), principale per prima e secondarie per priorità. Le
 * proposte dell'AI si mostrano solo nel piano corrente (T-3602): nelle versioni precedenti restano nelle righe.
 */
function toView(record: StrategyRecord, current: boolean): StrategyView {
  const state = toEditorState(record);
  const keywordsOf = (pageId: string | null) =>
    state.keywords
      .filter((keyword) => keyword.pageId === pageId)
      .sort((a, b) => Number(b.role === "MAIN") - Number(a.role === "MAIN") || compareKeywordPriority(a, b))
      .map(keywordView);
  const proposals = new Map(record.pages.map((page) => [page.id, current ? toAiProposal(page.ai_proposal) : null]));
  const pages = [...state.pages].sort((a, b) => a.position - b.position);
  const pageView = (page: EditorState["pages"][number]): StrategyPageView => ({
    ...page,
    aiProposal: proposals.get(page.id) ?? null,
    keywords: keywordsOf(page.id),
  });
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
  const [record, planId] = await Promise.all([findRecord(prisma, projectId, strategyId), findPlanId(projectId)]);
  return toView(record, planId === strategyId);
}

/**
 * Pagina del piano corrente per le proposte dell'AI (T-3601, T-3602) e per gli articoli (T-4002): 404
 * STRATEGY_NOT_FOUND se la strategia o la pagina non sono del progetto, 409 STRATEGY_READ_ONLY per una pagina di una
 * versione precedente. Restituisce gli H2 della pagina, da cui si stimano le richieste di un articolo.
 */
export async function requirePlanPage(project: AuthorizedProject, strategyId: string, pageId: string): Promise<{ h2: string[] }> {
  const [page, planId] = await Promise.all([
    prisma.strategyPage.findFirst({
      where: { id: pageId, strategy_id: strategyId, strategy: { project_id: project.id, project: project.perimeter } },
      select: { h2: true },
    }),
    findPlanId(project.id),
  ]);
  if (!page) throw new StrategyNotFoundError();
  if (planId !== strategyId) {
    throw new ConflictError("Le versioni precedenti del piano sono in sola lettura", "STRATEGY_READ_ONLY");
  }
  return page;
}

/**
 * Pagina da titolare, lingua e paese del piano (T-3601, T-5102), letti dopo requirePlanPage; 404 se nel frattempo è
 * sparita.
 */
export async function readPlanTitlePage(
  project: AuthorizedProject,
  strategyId: string,
  pageId: string
): Promise<{ language: string; country: string; page: TitlePage }> {
  const record = await findRecord(prisma, project.id, strategyId);
  const state = toEditorState(record);
  const page = state.pages.find((item) => item.id === pageId);
  if (!page) throw new StrategyNotFoundError();
  return { language: record.language, country: await strategyCountry(prisma, record), page: titlePageOf(state, page) };
}

/**
 * Salva (proposta) o toglie (null) la proposta dell'AI della pagina (T-3601, T-3602): solo la colonna ai_proposal, con
 * pagina, strategia e perimetro del progetto nel where (CWE-639); titoli, flag e version della strategia non cambiano.
 */
export async function savePageAiProposal(
  project: AuthorizedProject,
  strategyId: string,
  pageId: string,
  proposal: StrategyAiProposal | null
): Promise<void> {
  const { count } = await prisma.strategyPage.updateMany({
    where: { id: pageId, strategy_id: strategyId, strategy: { project_id: project.id, project: project.perimeter } },
    data: { ai_proposal: proposal ?? Prisma.DbNull },
  });
  expectOneRow(count, () => new StrategyNotFoundError());
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
      old.priority === page.priority &&
      old.position === page.position &&
      old.status === page.status &&
      old.statusChangedAt === page.statusChangedAt;
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
        position: page.position,
        status: page.status,
        status_changed_at: page.statusChangedAt ? new Date(page.statusChangedAt) : null,
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

/**
 * Solo il piano si modifica (T-2502): su una versione precedente del progetto 409 STRATEGY_READ_ONLY, prima di toccare
 * la version; una strategia fuori dal progetto arriva a claimVersion, che risponde 404.
 */
async function assertCurrentPlan(tx: Prisma.TransactionClient, project: AuthorizedProject, strategyId: string): Promise<void> {
  const planId = await findPlanId(project.id, tx);
  if (planId === null || planId === strategyId) return;
  const exists = await tx.strategy.count({ where: { id: strategyId, project_id: project.id, project: project.perimeter } });
  if (exists) {
    throw new ConflictError("Le versioni precedenti del piano sono in sola lettura", "STRATEGY_READ_ONLY");
  }
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
      await assertCurrentPlan(tx, project, strategyId);
      await claimVersion(tx, project, strategyId, version);
      const record = await findRecord(tx, project.id, strategyId);
      const before = toEditorState(record);
      const context = titleContext(record.language, await strategyCountry(tx, record));
      let after: EditorState;
      try {
        after = mutate(before, context);
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
