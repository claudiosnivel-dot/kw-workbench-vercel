import type { ArticleLength } from "@/lib/generated/prisma/enums";
import type { StrategyContentType, StrategyPageKind } from "@/lib/modules/strategy/types";

/*
 * Lunghezze degli articoli e richieste stimate (D-46), comuni al server (T-4002, T-4402) e alla finestra di avvio
 * (T-4401): tetto di parole per lunghezza, lunghezza proposta per la pagina, richieste di un articolo e di una
 * riscrittura. Nessuna dipendenza dal server: il modulo entra anche nei componenti.
 */

/** Lunghezze nell'ordine della finestra di avvio. */
export const ARTICLE_LENGTHS = ["SHORT", "MEDIUM", "LONG"] as const satisfies readonly ArticleLength[];

/** Tetto di parole dell'articolo per lunghezza: un massimo, non un obiettivo (D-46). */
export const ARTICLE_WORD_CAPS: Record<ArticleLength, number> = { SHORT: 800, MEDIUM: 1500, LONG: 2500 };

/** Lunghezza proposta (T-4401): Lunga per la pagina pilastro, Breve per una pagina locale, Media per le altre. */
export function defaultArticleLength(page: { kind: StrategyPageKind; contentType: StrategyContentType | string }): ArticleLength {
  if (page.kind === "HUB") return "LONG";
  return page.contentType === "local" ? "SHORT" : "MEDIUM";
}

/** Più 30% su ogni stima: le risposte scartate dal controllo passano al modello successivo. */
const withMargin = (requests: number) => Math.ceil((requests * 13) / 10);

/** Con meno di questi H2 nella pagina del piano la scaletta propone H2 nuovi solo per l'articolo (T-6503). */
export const MIN_PAGE_H2 = 2;
/** H2 nuovi che la scaletta propone a una pagina con meno di MIN_PAGE_H2 H2. */
export const PROPOSED_H2 = { min: 2, max: 4 } as const;

/** H2 dell'articolo al massimo: quelli della pagina, più i proposti dalla scaletta se la pagina ne ha meno di 2. */
export const maxArticleH2 = (h2Count: number): number => h2Count + (h2Count < MIN_PAGE_H2 ? PROPOSED_H2.max : 0);

/**
 * Stima delle richieste di un articolo (D-46): un H2 alla volta più 3 (scaletta, introduzione e FAQ), più il 30%; con
 * meno di 2 H2 nella pagina conta anche i 4 H2 che la scaletta può proporre, ognuno scritto in una richiesta (T-6503).
 */
export function estimateArticleRequests(h2Count: number): number {
  return withMargin(maxArticleH2(h2Count) + 3);
}

/** Stima di «Riscrivi questo blocco» (T-4402): la riscrittura e quella eventuale dei controlli, più il 30%. */
export const SECTION_REWRITE_REQUESTS = withMargin(2);
