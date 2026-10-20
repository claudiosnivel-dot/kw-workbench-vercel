import { buildOutlineRequest, type OutlineInput } from "@/lib/articles/outline-prompt";
import { parseOutlineResponse } from "@/lib/articles/outline-response";
import { readPhaseArticle } from "@/lib/articles/phase-data";
import { type PhaseContext, requestForRun, writeRun } from "@/lib/articles/run-context";
import { prisma } from "@/lib/prisma";

/**
 * Fase outline del lavoro di un articolo (T-4102): una richiesta con la pagina del piano, la scheda del progetto e
 * lunghezza e note dell'articolo; la scaletta accettata dal controllo salva meta title, meta description, slug, scaletta
 * e segnaposto immagine nell'articolo e crea i blocchi vuoti (INTRO e un H2 per heading), nella stessa transazione che
 * porta il lavoro alla fase successiva con progress_total uguale ai blocchi più 2 (scaletta e FAQ).
 */
export async function outlinePhase(context: PhaseContext): Promise<void> {
  const { run } = context;
  const { plan, brief, notes, length } = await readPhaseArticle(run);
  const input: OutlineInput = { plan, brief, notes, length };
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
