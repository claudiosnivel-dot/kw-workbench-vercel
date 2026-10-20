import type { OutlineInput } from "@/lib/articles/outline-prompt";
import type { OutlineBlock } from "@/lib/articles/outline-response";
import { type PhaseContext, type PhaseRun, writeRun } from "@/lib/articles/run-context";
import type { ArticleSectionKind, Prisma } from "@/lib/generated/prisma/client";
import { readArticlePlanPage } from "@/lib/modules/strategy/service";
import { prisma } from "@/lib/prisma";

/*
 * Letture e scritture comuni alle fasi del lavoro di un articolo (T-4102, T-4201, T-4202, T-4302): l'articolo con la
 * pagina del piano, la scheda del progetto, la scaletta salvata, le meta e i blocchi con il loro testo; il salvataggio di
 * un blocco scritto dal modello e il passaggio alla fase successiva senza richieste. Ogni lettura e scrittura porta il
 * progetto del lavoro (CWE-639).
 */

export type PhaseArticle = OutlineInput & {
  /** Blocchi della scaletta salvata dalla fase outline; vuoto prima della scaletta. */
  blocks: OutlineBlock[];
  /** Blocchi dell'articolo in ordine, con il testo e se l'autore lo ha cambiato. */
  sections: { id: string; position: number; kind: ArticleSectionKind; body: string; edited: boolean }[];
  metaTitle: string | null;
  metaDescription: string | null;
};

/** Blocchi della scaletta salvata in articles.outline come { model, blocks } (T-4102). */
function outlineBlocks(outline: Prisma.JsonValue): OutlineBlock[] {
  const blocks = outline && typeof outline === "object" && !Array.isArray(outline) ? outline.blocks : null;
  return Array.isArray(blocks) ? (blocks as unknown as OutlineBlock[]) : [];
}

/**
 * Articolo del lavoro con la pagina del piano (T-4102), la scheda del progetto (T-4001), la scaletta, le meta e i blocchi
 * in ordine; anche per i controlli di una modifica dell'autore (T-4402), con il solo articolo e il suo progetto.
 */
export async function readPhaseArticle(run: Pick<PhaseRun, "articleId" | "projectId">): Promise<PhaseArticle> {
  const article = await prisma.article.findFirstOrThrow({
    where: { id: run.articleId, project_id: run.projectId },
    select: {
      page_id: true,
      length: true,
      notes: true,
      outline: true,
      meta_title: true,
      meta_description: true,
      project: { select: { article_about: true, article_audience: true, article_tone: true } },
      sections: { orderBy: { position: "asc" }, select: { id: true, position: true, kind: true, body: true, edited: true } },
    },
  });
  return {
    plan: await readArticlePlanPage(run.projectId, article.page_id),
    brief: { about: article.project.article_about, audience: article.project.article_audience, tone: article.project.article_tone },
    notes: article.notes,
    length: article.length,
    blocks: outlineBlocks(article.outline),
    sections: article.sections,
    metaTitle: article.meta_title,
    metaDescription: article.meta_description,
  };
}

/** Istruzione dell'autore per la fase: solo per la riscrittura di un blocco (scope SECTION, modulo 44). */
export const phaseInstruction = (run: PhaseRun): string | null => (run.scope === "SECTION" ? run.instruction : null);

/** La fase non ha nulla da scrivere (per esempio la riscrittura di un altro blocco): passa alla successiva sotto lease. */
export async function skipPhase(context: PhaseContext): Promise<void> {
  await prisma.$transaction((tx) => writeRun(tx, context.lease, { phase: context.nextPhase, cursor: {} }));
}

/**
 * Salva il testo di un blocco scritto dal modello con il suo modello e edited false, nella stessa transazione che aggiorna
 * il lavoro sotto lease (fase, cursore) e conta la richiesta nell'avanzamento: un passo che ha perso la lease non scrive.
 */
export async function saveSectionText(
  context: PhaseContext,
  run: Prisma.ArticleRunUpdateManyMutationInput,
  sectionId: string,
  text: { body: string; model: string; heading?: string }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await writeRun(tx, context.lease, { ...run, progress_done: { increment: 1 } });
    await tx.articleSection.updateMany({
      where: { id: sectionId, article_id: context.run.articleId, article: { project_id: context.run.projectId } },
      data: { ...text, edited: false },
    });
  });
}
