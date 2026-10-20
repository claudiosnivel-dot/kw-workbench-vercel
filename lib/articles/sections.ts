import { phaseInstruction, readPhaseArticle, saveSectionText, skipPhase } from "@/lib/articles/phase-data";
import { type PhaseContext, requestForRun } from "@/lib/articles/run-context";
import { buildSectionRequest, type SectionInput } from "@/lib/articles/section-prompt";
import { parseSectionResponse } from "@/lib/articles/section-response";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Posizione del prossimo blocco da scrivere, salvata nel cursore del lavoro come { block: n }; 0 all'inizio della fase. */
function cursorBlock(cursor: Prisma.JsonValue): number {
  const block = cursor && typeof cursor === "object" && !Array.isArray(cursor) ? cursor.block : undefined;
  return typeof block === "number" ? block : 0;
}

/**
 * Fase sections del lavoro di un articolo (T-4201): un blocco per richiesta, introduzione e H2 nell'ordine della
 * scaletta; il blocco salva body, model ed edited false e il cursore passa al blocco seguente, oppure, dopo l'ultimo,
 * il lavoro passa alla fase successiva. Il motore ripete la fase finché resta tempo per un'altra richiesta (T-4101).
 * Con lo scope SECTION si riscrive solo il blocco del lavoro, con l'istruzione dell'autore tra i dati; il blocco FAQ
 * lo riscrive la fase faq (T-4202).
 */
export async function sectionsPhase(context: PhaseContext): Promise<void> {
  const { run } = context;
  const article = await readPhaseArticle(run);
  const writable = article.sections.filter((section) => section.kind !== "FAQ");
  const target =
    run.scope === "SECTION"
      ? writable.find((section) => section.id === run.sectionId)
      : writable.find((section) => section.position >= cursorBlock(run.cursor));
  if (!target) {
    await skipPhase(context);
    return;
  }

  const input: SectionInput = {
    plan: article.plan,
    brief: article.brief,
    notes: article.notes,
    blocks: article.blocks,
    position: target.position,
    instruction: phaseInstruction(run),
  };
  const { value: body, model } = await requestForRun(context, buildSectionRequest(input), (content) => parseSectionResponse(content, input));
  const more = run.scope === "ARTICLE" && writable.some((section) => section.position > target.position);
  await saveSectionText(context, more ? { cursor: { block: target.position + 1 } } : { phase: context.nextPhase, cursor: {} }, target.id, { body, model });
}
