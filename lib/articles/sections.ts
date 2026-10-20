import { type PhaseArticle, phaseInstruction, readPhaseArticle, saveSectionText, skipPhase } from "@/lib/articles/phase-data";
import { type PhaseContext, type PhaseRun, requestForRun } from "@/lib/articles/run-context";
import { buildSectionRequest, type SectionInput } from "@/lib/articles/section-prompt";
import { parseSectionResponse } from "@/lib/articles/section-response";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Posizione del prossimo blocco da scrivere o controllare, salvata nel cursore del lavoro come { block: n }; 0 all'inizio della fase. */
export function cursorBlock(cursor: Prisma.JsonValue): number {
  const block = cursor && typeof cursor === "object" && !Array.isArray(cursor) ? cursor.block : undefined;
  return typeof block === "number" ? block : 0;
}

/** Dati della richiesta per il blocco in position: la pagina, la scheda, le note, la scaletta e l'istruzione dell'autore. */
export function sectionInput(article: PhaseArticle, run: PhaseRun, position: number): SectionInput {
  return { plan: article.plan, brief: article.brief, notes: article.notes, blocks: article.blocks, position, instruction: phaseInstruction(run) };
}

/** Testo di un'introduzione o di un H2 scritto dal modello (T-4201), accettato dal controllo della risposta. */
export async function sectionText(context: PhaseContext, input: SectionInput): Promise<{ body: string; model: string }> {
  const { value: body, model } = await requestForRun(context, buildSectionRequest(input), (content) => parseSectionResponse(content, input));
  return { body, model };
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

  const text = await sectionText(context, sectionInput(article, run, target.position));
  const more = run.scope === "ARTICLE" && writable.some((section) => section.position > target.position);
  await saveSectionText(context, more ? { cursor: { block: target.position + 1 } } : { phase: context.nextPhase, cursor: {} }, target.id, text);
}
