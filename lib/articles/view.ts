import type { ArticleLength, ArticleRunScope, ArticleSectionKind, ArticleStatus, JobStatus } from "@/lib/generated/prisma/enums";

/*
 * Articolo come lo ricevono l'editor e le API (T-4002, T-4401, T-4402) e lettura dei suoi campi JSON: segnaposto
 * immagine, corrispondenze dei controlli, scaletta e rapporto SEO salvati dal motore (moduli 41-43). Un valore senza la
 * forma attesa vale vuoto, così un dato salvato da una versione precedente non rompe la pagina. Nessuna dipendenza dal
 * server: il modulo entra nei componenti (contratto di altitudine D-22).
 */

/** Articolo di una pagina con i blocchi in ordine e il lavoro attivo; i campi JSON si leggono con le funzioni sotto. */
export type ArticleView = {
  id: string;
  pageId: string;
  status: ArticleStatus;
  length: ArticleLength;
  notes: string | null;
  errorCode: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  slug: string | null;
  outline: unknown;
  images: unknown;
  seoReport: unknown;
  version: number;
  createdAt: string;
  updatedAt: string;
  sections: {
    id: string;
    position: number;
    kind: ArticleSectionKind;
    heading: string | null;
    body: string;
    checks: unknown;
    edited: boolean;
    model: string | null;
    updatedAt: string;
  }[];
  run: {
    id: string;
    scope: ArticleRunScope;
    sectionId: string | null;
    status: JobStatus;
    phase: string;
    progress: { done: number; total: number };
  } | null;
};

export type ArticleImageView = { position: number; cover: boolean; purpose: string; alt: string; fileName: string; prompt: string };

export type CheckMatchView = { kind: "ai_pattern" | "to_verify"; rule: string; start: number; end: number };

/** Problema del rapporto (T-4302): la regola con i suoi dati. */
export type ReportProblemView = { rule: string; keyword?: string; pageId?: string; length?: number; max?: number; count?: number };

export type SeoReportView = { density: number; problems: ReportProblemView[]; blocks: { position: number; problems: ReportProblemView[] }[] };

/** Blocco della scaletta (T-4102): keyword assegnate e pagine da collegare. */
export type OutlineBlockView = { position: number; keywords: string[]; links: string[] };

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const records = (value: unknown): Json[] => (Array.isArray(value) ? value.map(asRecord).filter((item): item is Json => item !== null) : []);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const integer = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : null);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/** Segnaposto immagine salvati in articles.images (T-4102), nell'ordine della scaletta. */
export function articleImages(value: unknown): ArticleImageView[] {
  return records(value).flatMap((image) => {
    const position = integer(image.position);
    if (position === null || !text(image.prompt)) return [];
    return [{ position, cover: image.cover === true, purpose: text(image.purpose), alt: text(image.alt), fileName: text(image.fileName), prompt: text(image.prompt) }];
  });
}

/** Corrispondenze dei controlli di un blocco (T-4301) con start ed end dentro il testo. */
export function checkMatches(checks: unknown, body: string): CheckMatchView[] {
  return records(asRecord(checks)?.matches).flatMap((match) => {
    const start = integer(match.start);
    const end = integer(match.end);
    const kind = match.kind === "ai_pattern" || match.kind === "to_verify" ? match.kind : null;
    if (!kind || start === null || end === null || start < 0 || end <= start || end > body.length) return [];
    return [{ kind, rule: text(match.rule), start, end }];
  });
}

function problems(value: unknown): ReportProblemView[] {
  return records(value).map((problem) => {
    const view: ReportProblemView = { rule: text(problem.rule) };
    if (typeof problem.keyword === "string") view.keyword = problem.keyword;
    if (typeof problem.pageId === "string") view.pageId = problem.pageId;
    for (const field of ["length", "max", "count"] as const) {
      const number = integer(problem[field]);
      if (number !== null) view[field] = number;
    }
    return view;
  });
}

/** Rapporto SEO dell'articolo (T-4302); null prima della fase dei controlli. */
export function seoReportOf(value: unknown): SeoReportView | null {
  const report = asRecord(value);
  if (!report || typeof report.density !== "number") return null;
  return {
    density: report.density,
    problems: problems(report.problems),
    blocks: records(report.blocks).flatMap((block) => {
      const position = integer(block.position);
      return position === null ? [] : [{ position, problems: problems(block.problems) }];
    }),
  };
}

/** Blocchi della scaletta salvata in articles.outline come { model, blocks } (T-4102). */
export function outlineBlocksOf(value: unknown): OutlineBlockView[] {
  return records(asRecord(value)?.blocks).flatMap((block) => {
    const position = integer(block.position);
    return position === null ? [] : [{ position, keywords: strings(block.keywords), links: strings(block.links) }];
  });
}

/** Pagine del piano collegate nel testo con [testo](page:<id>), una volta ciascuna, nell'ordine. */
export function linkedPageIds(body: string): string[] {
  return [...new Set([...body.matchAll(/\]\(page:([^()\s]+)\)/g)].map((match) => match[1]))];
}
