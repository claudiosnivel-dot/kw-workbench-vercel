import { buildOutlineRequest, type OutlineInput } from "@/lib/articles/outline-prompt";
import { parseOutlineResponse } from "@/lib/articles/outline-response";
import { type PhaseContext, requestForRun, writeRun } from "@/lib/articles/run-context";
import { readArticlePlanPage } from "@/lib/modules/strategy/service";
import { prisma } from "@/lib/prisma";

/**
 * Fase outline del lavoro di un articolo (T-4102): una richiesta con la pagina del piano, la scheda del progetto e
 * lunghezza e note dell'articolo; la scaletta accettata dal controllo salva meta title, meta description, slug, scaletta
 * e segnaposto immagine nell'articolo e crea i blocchi vuoti (INTRO e un H2 per heading), nella stessa transazione che
 * porta il lavoro alla fase successiva con progress_total uguale ai blocchi più 2 (scaletta e FAQ).
 */
export async function outlinePhase(context: PhaseContext): Promise<void> {
  const { run } = context;
  const article = await prisma.article.findFirstOrThrow({
    where: { id: run.articleId, project_id: run.projectId },
    select: {
      page_id: true,
      length: true,
      notes: true,
      project: { select: { article_about: true, article_audience: true, article_tone: true } },
    },
  });
  const input: OutlineInput = {
    plan: await readArticlePlanPage(run.projectId, article.page_id),
    brief: { about: article.project.article_about, audience: article.project.article_audience, tone: article.project.article_tone },
    notes: article.notes,
    length: article.length,
  };
  const { value: outline, model } = await requestForRun(context, buildOutlineRequest(input), (content) => parseOutlineResponse(content, input));

  await prisma.$transaction(async (tx) => {
    await writeRun(tx, context.lease, { phase: context.nextPhase, progress_done: 1, progress_total: outline.blocks.length + 2 });
    await tx.article.updateMany({
      where: { id: run.articleId, project_id: run.projectId, status: "GENERATING" },
      data: {
        meta_title: outline.metaTitle,
        meta_description: outline.metaDescription,
        slug: outline.slug,
        outline: { model, blocks: outline.blocks },
        images: outline.images,
      },
    });
    await tx.articleSection.deleteMany({ where: { article_id: run.articleId, article: { project_id: run.projectId } } });
    await tx.articleSection.createMany({
      data: outline.blocks.map((block) => ({ article_id: run.articleId, position: block.position, kind: block.kind, heading: block.heading })),
    });
  });
}
