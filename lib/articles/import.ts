import { z } from "zod";
import { AiTitlesError } from "@/lib/ai/errors";
import { authorBlockChecks, type CheckedArticle, seoReport } from "@/lib/articles/checks";
import { ARTICLE_META_FIELDS, MAX_SECTIONS } from "@/lib/articles/edit";
import { faqHeading } from "@/lib/articles/faq";
import { ARTICLE_LENGTHS, ARTICLE_WORD_CAPS } from "@/lib/articles/lengths";
import { markdownWords, nextFence, sanitizeSectionMarkdown } from "@/lib/articles/markdown-sanitizer";
import { activeRunError, type Actor, ArticleNotFoundError, findArticle, isUniqueViolation, markPageWriting } from "@/lib/articles/service";
import { checkMatches, seoReportOf } from "@/lib/articles/view";
import type { AuthorizedProject } from "@/lib/authz/workspace";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ArticleLength, ArticleSectionKind } from "@/lib/generated/prisma/enums";
import { AppError, ConflictError } from "@/lib/http/errors";
import { type ArticlePlanPage, findPlanId, readArticlePlanPage, requirePlanPage, StrategyNotFoundError } from "@/lib/modules/strategy/service";
import { MAX_TITLE_LENGTH } from "@/lib/modules/strategy/titles";
import { prisma } from "@/lib/prisma";

/*
 * Articoli di Claude Code (T-7601, D-64): il Markdown che Claude Code ha scritto nel sito diventa l'articolo pronto
 * della pagina, diviso nei blocchi di oggi e ripulito come il testo delle AI (CWE-79), con i controlli deterministici
 * di oggi; nessun lavoro di generazione, nessuna richiesta alle AI e nessun limite degli articoli. La version
 * dell'articolo evita di sovrascrivere alla cieca le modifiche fatte nell'editor (CWE-362).
 */

/** Markdown di un'importazione al massimo (CWE-770): ben oltre i 2500 parole dell'articolo più lungo. */
const MAX_IMPORT_MARKDOWN = 200_000;

/** Campi di import_article oltre a progetto e pagina, con i limiti dell'editor per meta e slug (T-4402). */
export const IMPORT_ARTICLE_FIELDS = {
  markdown: z.string().min(1).max(MAX_IMPORT_MARKDOWN),
  metaTitle: ARTICLE_META_FIELDS.metaTitle,
  metaDescription: ARTICLE_META_FIELDS.metaDescription,
  slug: ARTICLE_META_FIELDS.slug,
  version: z.number().int().min(0),
};

export type ImportArticleInput = {
  pageId: string;
  markdown: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  /** Version letta, sempre obbligatoria (T-8202, D-70): 0 quando la pagina non ha ancora un articolo. */
  version: number;
};

/** Blocco importato con il testo già ripulito, nella posizione dell'articolo. */
type ImportedBlock = { position: number; kind: ArticleSectionKind; heading: string | null; body: string };

/** Titolo di livello 2: «## » all'inizio della riga (fino a 3 spazi) seguito dal testo; «###» non lo è. */
const H2_LINE = /^ {0,3}##[ \t]+(\S.*)$/;
const CLOSING_HASHES = /[ \t]+#+[ \t]*$/;
/** Testo dei corrispondenti dei controlli nella risposta: abbastanza per ritrovarli nel testo. */
const MAX_MATCH_TEXT = 200;
const NO_LINKS: ReadonlyMap<string, string> = new Map();

const invalidMarkdown = (message: string, heading?: string) =>
  new AppError(400, "VALIDATION_ERROR", message, { field: "markdown", ...(heading ? { heading } : {}) });

const versionConflict = (currentVersion: number) =>
  new AppError(409, "ARTICLE_VERSION_CONFLICT", "L'articolo è stato modificato altrove", { currentVersion });

type RawBlock = { heading: string | null; lines: string[] };

/**
 * Righe del Markdown divise ai titoli «## »: il primo blocco è il testo prima del primo titolo (heading null). Un «## »
 * dentro un blocco di codice resta testo, come lo legge la pulizia.
 */
function splitAtHeadings(markdown: string): RawBlock[] {
  const blocks: RawBlock[] = [{ heading: null, lines: [] }];
  let fence: string | null = null;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const code = nextFence(line, fence);
    fence = code.fence;
    const heading = code.inside ? null : H2_LINE.exec(line);
    if (heading) {
      blocks.push({ heading: heading[1].replace(CLOSING_HASHES, "").trim(), lines: [] });
    } else {
      blocks[blocks.length - 1].lines.push(line);
    }
  }
  return blocks;
}

/** Testo ripulito come quello delle AI (T-4201); vuoto se non resta testo. */
function cleanText(text: string, links: ReadonlyMap<string, string>): string {
  try {
    return sanitizeSectionMarkdown(text, links);
  } catch (error) {
    if (error instanceof AiTitlesError) return "";
    throw error;
  }
}

/** Titolo di un blocco come testo semplice: senza HTML, link, grassetto e corsivo, su una riga. */
const cleanHeading = (text: string) =>
  cleanText(text, NO_LINKS)
    .replace(/[*_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Titoli uguali senza maiuscole, spazi in più e punteggiatura finale: «Domande frequenti:» è il titolo delle FAQ. */
const headingKey = (text: string) =>
  text
    .toLocaleLowerCase()
    .replace(/[\s:.!?]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Blocchi dell'articolo dal Markdown (T-7601): il testo prima del primo «## » è l'introduzione (assente se dopo la
 * pulizia non ha testo, per esempio con il solo titolo «# »), ogni «## » un H2 con il suo titolo, la sezione con il
 * titolo delle domande frequenti della lingua del piano (T-4202) il blocco FAQ, una sola. Ogni testo passa dalla pulizia
 * dei blocchi delle AI con i link page: verso le pagine collegabili; un titolo o una sezione senza testo, un titolo oltre
 * 200 caratteri o più di 40 blocchi → 400 VALIDATION_ERROR sul campo markdown.
 */
function articleBlocks(markdown: string, plan: Pick<ArticlePlanPage, "language" | "linkable">): ImportedBlock[] {
  const [intro, ...sections] = splitAtHeadings(markdown);
  if (sections.length > MAX_SECTIONS) throw invalidMarkdown(`Al massimo ${MAX_SECTIONS} blocchi`);
  const links = new Map(plan.linkable.map((page) => [page.pageId, page.pageId]));
  const faq = headingKey(faqHeading(plan.language));
  const blocks: Omit<ImportedBlock, "position">[] = [];
  const introBody = cleanText(intro.lines.join("\n"), links);
  if (introBody) blocks.push({ kind: "INTRO", heading: null, body: introBody });
  for (const section of sections) {
    const heading = cleanHeading(section.heading ?? "");
    if (!heading) throw invalidMarkdown("Un titolo «## » non ha testo");
    if (Array.from(heading).length > MAX_TITLE_LENGTH) throw invalidMarkdown(`Titolo oltre ${MAX_TITLE_LENGTH} caratteri`, heading.slice(0, 80));
    const body = cleanText(section.lines.join("\n"), links);
    if (!body) throw invalidMarkdown("La sezione non ha testo", heading);
    const kind = headingKey(heading) === faq ? "FAQ" : "H2";
    if (kind === "FAQ" && blocks.some((block) => block.kind === "FAQ")) throw invalidMarkdown("Una sola sezione di domande frequenti", heading);
    blocks.push({ kind, heading, body });
  }
  if (blocks.length === 0) throw invalidMarkdown("L'articolo non ha testo");
  if (blocks.length > MAX_SECTIONS) throw invalidMarkdown(`Al massimo ${MAX_SECTIONS} blocchi`);
  return blocks.map((block, position) => ({ position, ...block }));
}

/** Lunghezza dalle parole del testo con i tetti di oggi (D-46): Breve fino a 800, Media fino a 1500, poi Lunga. */
function importedLength(blocks: Pick<ImportedBlock, "body">[]): ArticleLength {
  const words = blocks.reduce((sum, block) => sum + markdownWords(block.body).length, 0);
  return ARTICLE_LENGTHS.find((length) => words <= ARTICLE_WORD_CAPS[length]) ?? "LONG";
}

/** Strategia della pagina nel progetto autorizzato: 404 STRATEGY_NOT_FOUND anche per la pagina di un altro progetto (CWE-639). */
async function pageStrategyId(project: AuthorizedProject, pageId: string): Promise<string> {
  const page = await prisma.strategyPage.findFirst({
    where: { id: pageId, strategy: { project_id: project.id, project: project.perimeter } },
    select: { strategy_id: true },
  });
  if (!page) throw new StrategyNotFoundError();
  return page.strategy_id;
}

/** Un avvio o un'importazione arrivati insieme hanno creato l'articolo: il lavoro attivo o la version corrente. */
async function concurrentChange(project: AuthorizedProject, strategyId: string, pageId: string): Promise<AppError> {
  const article = await findArticle(project, strategyId, pageId);
  if (!article) return versionConflict(0);
  return article.runs.length > 0 ? activeRunError(article.runs[0].id) : versionConflict(article.version);
}

/**
 * Importa l'articolo di Claude Code nella pagina del piano corrente (T-7601), con il permesso strategy.write già
 * verificato: pagina di un altro progetto 404 STRATEGY_NOT_FOUND, di un piano precedente 409 STRATEGY_READ_ONLY, un
 * lavoro delle AI di Titan SEO sull'articolo 409 JOB_ALREADY_ACTIVE. La version letta serve sempre (T-8202, D-70):
 * senza articolo vale 0 e lo crea con version 1, con un articolo è la sua; una diversa è 409 ARTICLE_VERSION_CONFLICT
 * con currentVersion (0 senza articolo) e nulla cambia. In una
 * transazione l'articolo diventa READY con source AGENT, meta, slug, lunghezza, rapporto SEO e version cresciuta di 1,
 * i blocchi si sostituiscono con i controlli del loro testo e la pagina «Da scrivere» passa «In scrittura».
 */
export async function importAgentArticle(actor: Actor, project: AuthorizedProject, input: ImportArticleInput): Promise<void> {
  const strategyId = await pageStrategyId(project, input.pageId);
  await requirePlanPage(project, strategyId, input.pageId);
  const plan = await readArticlePlanPage(project.id, input.pageId);
  const blocks = articleBlocks(input.markdown, plan);
  const existing = await findArticle(project, strategyId, input.pageId);
  if (existing && existing.runs.length > 0) throw activeRunError(existing.runs[0].id);

  const article: CheckedArticle = { plan, blocks: [], sections: blocks, metaTitle: input.metaTitle, metaDescription: input.metaDescription };
  const fields = {
    source: "AGENT",
    status: "READY",
    error_code: null,
    length: importedLength(blocks),
    meta_title: input.metaTitle,
    meta_description: input.metaDescription,
    slug: input.slug,
    outline: Prisma.DbNull,
    images: Prisma.DbNull,
    seo_report: seoReport(article),
    created_by_user_id: actor.id,
  } satisfies Prisma.ArticleUncheckedUpdateManyInput;
  const sections = blocks.map((block) => ({ ...block, checks: authorBlockChecks(article, block.position) }));

  try {
    await prisma.$transaction(async (tx) => {
      if ((await findPlanId(project.id, tx)) !== strategyId) {
        throw new ConflictError("Le versioni precedenti del piano sono in sola lettura", "STRATEGY_READ_ONLY");
      }
      const current = await tx.article.findFirst({ where: { page_id: input.pageId, project_id: project.id }, select: { id: true, version: true } });
      let articleId: string;
      if (current) {
        if (input.version !== current.version) throw versionConflict(current.version);
        const { count } = await tx.article.updateMany({
          where: { id: current.id, project_id: project.id, version: current.version },
          data: { ...fields, version: { increment: 1 } },
        });
        if (count !== 1) throw versionConflict((await tx.article.findFirst({ where: { id: current.id, project_id: project.id }, select: { version: true } }))?.version ?? 0);
        await tx.articleSection.deleteMany({ where: { article_id: current.id, article: { project_id: project.id } } });
        articleId = current.id;
      } else {
        if (input.version !== 0) throw versionConflict(0);
        const created = await tx.article.create({
          data: { ...fields, page_id: input.pageId, project_id: project.id, version: 1 },
          select: { id: true },
        });
        articleId = created.id;
      }
      await tx.articleSection.createMany({ data: sections.map((section) => ({ ...section, article_id: articleId })) });
      await markPageWriting(tx, project, strategyId, input.pageId);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    throw await concurrentChange(project, strategyId, input.pageId);
  }
}

const AGENT_ARTICLE_SELECT = {
  id: true,
  page_id: true,
  status: true,
  source: true,
  version: true,
  length: true,
  meta_title: true,
  meta_description: true,
  slug: true,
  seo_report: true,
  sections: { orderBy: { position: "asc" }, select: { position: true, kind: true, heading: true, body: true, checks: true } },
} satisfies Prisma.ArticleSelect;

type AgentArticleRecord = Prisma.ArticleGetPayload<{ select: typeof AGENT_ARTICLE_SELECT }>;

/**
 * Controlli salvati per Claude Code: densità e problemi dell'articolo dal rapporto SEO (T-4302), poi i blocchi con
 * problemi o con corrispondenze dei controlli del testo (T-4301), ognuna con il suo testo.
 */
function savedChecks(record: AgentArticleRecord) {
  const report = seoReportOf(record.seo_report);
  const problemsAt = new Map(report?.blocks.map((block) => [block.position, block.problems]));
  const blocks = record.sections.flatMap((section) => {
    const style = checkMatches(section.checks, section.body).map((match) => ({
      kind: match.kind,
      rule: match.rule,
      text: section.body.slice(match.start, match.end).slice(0, MAX_MATCH_TEXT),
    }));
    const problems = problemsAt.get(section.position) ?? [];
    return problems.length + style.length === 0 ? [] : [{ position: section.position, heading: section.heading, problems, style }];
  });
  return { density: report?.density ?? null, problems: report?.problems ?? [], blocks };
}

/**
 * Articolo della pagina per Claude Code (T-7601), nel progetto già autorizzato: blocchi in ordine con tipo, titolo e
 * testo, meta, slug, version, source, stato e controlli salvati; 404 ARTICLE_NOT_FOUND senza articolo (CWE-639).
 */
export async function readAgentArticle(project: AuthorizedProject, pageId: string) {
  const record = await prisma.article.findFirst({
    where: { page_id: pageId, project_id: project.id, project: project.perimeter },
    select: AGENT_ARTICLE_SELECT,
  });
  if (!record) throw new ArticleNotFoundError();
  return {
    articleId: record.id,
    pageId: record.page_id,
    version: record.version,
    source: record.source,
    status: record.status,
    length: record.length,
    metaTitle: record.meta_title,
    metaDescription: record.meta_description,
    slug: record.slug,
    blocks: record.sections.map((section) => ({ position: section.position, kind: section.kind, heading: section.heading, text: section.body })),
    checks: savedChecks(record),
  };
}
