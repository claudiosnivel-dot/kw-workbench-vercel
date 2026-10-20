import { buildFaqRequest, type FaqInput } from "@/lib/articles/faq-prompt";
import { faqMarkdown, parseFaqResponse } from "@/lib/articles/faq-response";
import { type PhaseArticle, phaseInstruction, readPhaseArticle, saveSectionText, skipPhase } from "@/lib/articles/phase-data";
import { type PhaseContext, type PhaseRun, requestForRun, writeRun } from "@/lib/articles/run-context";
import { prisma } from "@/lib/prisma";

/** Titolo del blocco FAQ nella lingua del piano (T-4202); inglese per le lingue senza istruzioni proprie. */
const FAQ_HEADINGS: Record<string, string> = { it: "Domande frequenti", es: "Preguntas frecuentes" };
const faqHeading = (language: string) => FAQ_HEADINGS[language] ?? "Frequently asked questions";

/** Dati della richiesta delle domande frequenti: la pagina, la scheda, le note, la scaletta e l'istruzione dell'autore. */
export function faqInput(article: PhaseArticle, run: PhaseRun): FaqInput {
  return { plan: article.plan, brief: article.brief, notes: article.notes, blocks: article.blocks, instruction: phaseInstruction(run) };
}

/** Blocco FAQ scritto dal modello (T-4202): il titolo della lingua e le coppie accettate dal controllo, in Markdown. */
export async function faqText(context: PhaseContext, input: FaqInput): Promise<{ heading: string; body: string; model: string }> {
  const { value: pairs, model } = await requestForRun(context, buildFaqRequest(input), parseFaqResponse);
  return { heading: faqHeading(input.plan.language), body: faqMarkdown(pairs), model };
}

/**
 * Fase faq del lavoro di un articolo (T-4202), dopo sections: una richiesta con le keyword-domanda della pagina, le
 * altre secondarie e la scaletta; le coppie accettate dal controllo si salvano in fondo all'articolo come blocco FAQ
 * (una domanda in grassetto e la sua risposta) con il titolo della lingua, nella stessa transazione che porta il lavoro
 * alla fase successiva. Con lo scope SECTION la fase riscrive solo il blocco FAQ del lavoro, con l'istruzione dell'autore.
 */
export async function faqPhase(context: PhaseContext): Promise<void> {
  const { run } = context;
  const article = await readPhaseArticle(run);
  const existing = article.sections.find((section) => section.kind === "FAQ");
  if (run.scope === "SECTION" && (!existing || existing.id !== run.sectionId)) {
    await skipPhase(context);
    return;
  }

  const text = await faqText(context, faqInput(article, run));
  if (existing) {
    await saveSectionText(context, { phase: context.nextPhase }, existing.id, text);
    return;
  }
  const position = article.sections.reduce((last, section) => Math.max(last, section.position), -1) + 1;
  await prisma.$transaction(async (tx) => {
    await writeRun(tx, context.lease, { phase: context.nextPhase, progress_done: { increment: 1 } });
    await tx.articleSection.create({ data: { article_id: run.articleId, position, kind: "FAQ", ...text } });
  });
}
