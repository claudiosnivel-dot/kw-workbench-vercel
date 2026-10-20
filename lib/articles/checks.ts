import { AiTitlesError } from "@/lib/ai/errors";
import { faqInput, faqText } from "@/lib/articles/faq";
import { linkableRef } from "@/lib/articles/outline-prompt";
import { requiredLinkPages } from "@/lib/articles/outline-response";
import { type PhaseArticle, readPhaseArticle } from "@/lib/articles/phase-data";
import { type PhaseContext, writeRun } from "@/lib/articles/run-context";
import type { RewriteProblem } from "@/lib/articles/section-prompt";
import { cursorBlock, sectionInput, sectionText } from "@/lib/articles/sections";
import { analyzeSeo, type SeoArticle, type SeoProblem } from "@/lib/articles/seo-check";
import { analyzeStyle, STYLE_RULES_VERSION, type StyleAnalysis } from "@/lib/articles/style-check";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/*
 * Fase checks del lavoro di un articolo (T-4302, D-46), dopo le domande frequenti: ogni blocco passa l'analisi dei
 * tratti AI e dei dati da verificare (T-4301) e il controllo SEO; un blocco che non li supera si riscrive una volta con
 * l'elenco dei problemi, poi si salvano i controlli del blocco e, dopo l'ultimo, il rapporto SEO dell'articolo con i
 * problemi rimasti. Il verdetto è dei controlli deterministici, mai del modello.
 */

/** Testo di un problema inviato al modello: abbastanza per riconoscere il tratto. */
const MAX_PROBLEM_TEXT = 200;

type Section = PhaseArticle["sections"][number];

/** Controlli di un blocco: l'analisi del testo (T-4301) e i problemi SEO del blocco (T-4302). */
type BlockCheck = { style: StyleAnalysis; problems: SeoProblem[] };

/** Problema del rapporto oltre a quelli SEO: il blocco supera ancora la soglia dei tratti AI. */
type ReportProblem = SeoProblem | { rule: "ai_patterns"; count: number };

/** Articolo per il controllo SEO: keyword e link di ogni blocco dalla scaletta, nessuno per il blocco FAQ. */
function seoArticle(article: PhaseArticle): SeoArticle {
  const outline = new Map(article.blocks.map((block) => [block.position, block]));
  return {
    language: article.plan.language,
    mainKeyword: article.plan.page.main.keyword,
    h1: article.plan.h1,
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    requiredLinks: requiredLinkPages(article.plan),
    blocks: article.sections.map((section) => {
      const block = section.kind === "FAQ" ? undefined : outline.get(section.position);
      return { position: section.position, body: section.body, keywords: block?.keywords ?? [], links: block?.links ?? [] };
    }),
  };
}

const aiPatternCount = (style: StyleAnalysis) => style.matches.filter((match) => match.kind === "ai_pattern").length;

/** Controlli del blocco in position con il testo che ha nell'articolo dato. */
function checkBlock(article: PhaseArticle, position: number): BlockCheck {
  const body = article.sections.find((section) => section.position === position)?.body ?? "";
  return {
    style: analyzeStyle(body, article.plan.language),
    problems: analyzeSeo(seoArticle(article)).blocks.find((block) => block.position === position)?.problems ?? [],
  };
}

/** Il blocco si riscrive con la soglia dei tratti AI superata, una keyword assegnata assente, la densità o un link obbligatorio. */
const needsRewrite = (check: BlockCheck) => check.style.overLimit || check.problems.length > 0;

/** Problemi per la riscrittura: i tratti AI con il testo trovato, una volta ciascuno, poi i problemi SEO del blocco. */
function rewriteProblems(article: PhaseArticle, section: Section, check: BlockCheck): RewriteProblem[] {
  const patterns = new Map<string, RewriteProblem>();
  for (const match of check.style.matches) {
    if (match.kind !== "ai_pattern") continue;
    const text = section.body.slice(match.start, match.end).slice(0, MAX_PROBLEM_TEXT);
    patterns.set(`${match.rule}\n${text}`, { rule: match.rule, text });
  }
  const targets = new Map(article.plan.linkable.map((page, index) => [page.pageId, `page:${linkableRef(index)}`]));
  const seo = check.problems.map((problem): RewriteProblem => {
    if (problem.rule === "keyword_missing") return { rule: problem.rule, keyword: problem.keyword };
    if (problem.rule === "density") return { rule: problem.rule, keyword: article.plan.page.main.keyword, max: problem.max };
    if (problem.rule === "link_missing") return { rule: problem.rule, target: targets.get(problem.pageId) };
    return { rule: problem.rule };
  });
  return [...patterns.values(), ...seo];
}

/**
 * Riscrittura del blocco con la richiesta della sua fase (T-4201 per introduzione e H2, T-4202 per il blocco FAQ) più i
 * problemi. Una riscrittura non riuscita (nessun modello disponibile o nessuna risposta valida) lascia la prima
 * stesura: i problemi restano nel rapporto e l'articolo arriva comunque alla fine.
 */
async function rewrite(context: PhaseContext, article: PhaseArticle, section: Section, problems: RewriteProblem[]) {
  try {
    if (section.kind === "FAQ") return await faqText(context, { ...faqInput(article, context.run), problems });
    return await sectionText(context, { ...sectionInput(article, context.run, section.position), problems });
  } catch (error) {
    if (error instanceof AiTitlesError) return null;
    throw error;
  }
}

const storedChecks = (check: BlockCheck, rewritten: boolean) => ({ version: STYLE_RULES_VERSION, ...check.style, problems: check.problems, rewritten });

/** Controlli salvati di un blocco modificato dall'autore (T-4402): quelli del testo che ha nell'articolo dato, senza modello. */
export const authorBlockChecks = (article: PhaseArticle, position: number) => storedChecks(checkBlock(article, position), false);

/** Rapporto SEO dell'articolo (T-4302): densità e problemi dell'articolo, poi i blocchi con i problemi rimasti. */
export function seoReport(article: PhaseArticle) {
  const seo = analyzeSeo(seoArticle(article));
  const blocks = article.sections.map((section) => {
    const style = analyzeStyle(section.body, article.plan.language);
    const problems: ReportProblem[] = [
      ...(seo.blocks.find((block) => block.position === section.position)?.problems ?? []),
      ...(style.overLimit ? [{ rule: "ai_patterns" as const, count: aiPatternCount(style) }] : []),
    ];
    return { position: section.position, problems };
  });
  return { version: STYLE_RULES_VERSION, density: seo.density, problems: seo.problems, blocks: blocks.filter((block) => block.problems.length > 0) };
}

/** Salva sotto lease il lavoro, i controlli del blocco con l'eventuale riscrittura e, a fine fase, il rapporto SEO. */
async function saveChecks(
  context: PhaseContext,
  article: PhaseArticle,
  run: Prisma.ArticleRunUpdateManyMutationInput,
  block: { section: Section; check: BlockCheck; text: { body: string; model: string; heading?: string } | null } | null
): Promise<void> {
  const { articleId, projectId } = context.run;
  await prisma.$transaction(async (tx) => {
    await writeRun(tx, context.lease, run);
    if (block) {
      await tx.articleSection.updateMany({
        where: { id: block.section.id, article_id: articleId, article: { project_id: projectId } },
        data: { checks: storedChecks(block.check, block.text !== null), ...(block.text ? { ...block.text, edited: false } : {}) },
      });
    }
    if (run.phase) {
      await tx.article.updateMany({ where: { id: articleId, project_id: projectId }, data: { seo_report: seoReport(article) } });
    }
  });
}

/**
 * Fase checks (T-4302): un blocco per volta nell'ordine dell'articolo, con il cursore { block: n } come la fase sections.
 * Il blocco che non supera i controlli e non è stato modificato dall'autore si riscrive una volta, e al massimo una
 * per blocco e per lavoro (CWE-770); i controlli salvati sono quelli del testo che resta. Dopo l'ultimo blocco il
 * rapporto SEO dell'articolo e la fase successiva. Con lo scope SECTION si controlla solo il blocco del lavoro e il
 * rapporto si ricalcola sull'intero articolo.
 */
export async function checksPhase(context: PhaseContext): Promise<void> {
  const { run } = context;
  let article = await readPhaseArticle(run);
  const section =
    run.scope === "SECTION"
      ? article.sections.find((item) => item.id === run.sectionId)
      : article.sections.find((item) => item.position >= cursorBlock(run.cursor));
  const done = { phase: context.nextPhase, cursor: {} };
  if (!section) {
    await saveChecks(context, article, done, null);
    return;
  }

  let check = checkBlock(article, section.position);
  const text = !section.edited && needsRewrite(check) ? await rewrite(context, article, section, rewriteProblems(article, section, check)) : null;
  if (text) {
    article = { ...article, sections: article.sections.map((item) => (item.id === section.id ? { ...item, body: text.body } : item)) };
    check = checkBlock(article, section.position);
  }
  const more = run.scope === "ARTICLE" && article.sections.some((item) => item.position > section.position);
  await saveChecks(context, article, more ? { cursor: { block: section.position + 1 } } : done, { section, check, text });
}
