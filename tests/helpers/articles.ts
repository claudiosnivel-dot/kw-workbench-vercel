import { DELETE as cancelRunRoute } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/article/run/route";
import { GET as readRoute, POST as startRoute } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/article/route";
import type { AiSettings } from "@/lib/ai/settings";
import { upsertSettingValue } from "@/lib/integrations/app-settings";
import type { PlanPage } from "./ai-titles";
import { callRoute } from "./http";

/*
 * Supporto dei test degli articoli (T-4002): impostazioni dell'AI con gli articoli accesi, salvate come le salva la card
 * del root admin, le rotte dell'articolo di una pagina del piano e le risposte simulate del modello per le richieste del
 * lavoro (scaletta, blocchi e domande frequenti).
 */

/** Impostazioni dell'AI con gli articoli accesi e i limiti predefiniti, salvo indicazione contraria. */
export async function saveArticleSettings(settings: Partial<AiSettings> = {}): Promise<void> {
  const value: AiSettings = {
    enabled: false,
    models: ["autore/modello-prova:free"],
    platformDailyRequests: 900,
    workspaceDailyLimit: 10,
    articlesEnabled: true,
    articlesPerWorkspaceDaily: 3,
    sectionRewritesPerWorkspaceDaily: 20,
    ...settings,
  };
  await upsertSettingValue({ key: "AI_TITLES_SETTINGS", value: JSON.stringify(value) });
}

const articleUrl = (page: PlanPage) => `/api/projects/${page.projectId}/strategies/${page.strategyId}/pages/${page.pageId}/article`;
const params = (page: PlanPage) => ({ id: page.projectId, strategyId: page.strategyId, pageId: page.pageId });

export const startArticle = (cookie: string | undefined, page: PlanPage, body: unknown = { length: "MEDIUM" }) =>
  callRoute(startRoute, { method: "POST", url: articleUrl(page), cookie, params: params(page), body });

export const readArticle = (cookie: string | undefined, page: PlanPage) =>
  callRoute(readRoute, { method: "GET", url: articleUrl(page), cookie, params: params(page) });

export const cancelArticleRun = (cookie: string | undefined, page: PlanPage) =>
  callRoute(cancelRunRoute, { method: "DELETE", url: `${articleUrl(page)}/run`, cookie, params: params(page) });

/** Dati della pagina che la scaletta invia al modello (T-4102), letti dal messaggio dell'utente. */
export type SentOutlineData = {
  h2: { id: string; heading: string }[];
  mainKeyword: string;
  linkablePages: { id: string; role: "pillar" | "spoke"; h1: string }[];
};

/** Corpo di una chiamata catturata dal fetch simulato: messaggi e modello inviati a OpenRouter. */
export function sentBody(init: RequestInit | undefined): { model: string; messages: { role: string; content: string }[] } {
  return JSON.parse(String(init?.body)) as { model: string; messages: { role: string; content: string }[] };
}

/**
 * Scaletta valida per i dati inviati (T-4102): un blocco per id con 100 parole, nell'introduzione i link a ogni pagina
 * collegabile (così ci sono quello alla pilastro e quelli agli spoke), meta con la keyword principale e la copertina.
 */
export function outlineReply(data: SentOutlineData) {
  return {
    metaTitle: data.mainKeyword,
    metaDescription: `Guida a ${data.mainKeyword}: cosa sapere prima di scegliere.`,
    blocks: [{ id: "INTRO" }, ...data.h2].map((block, index) => ({
      id: block.id,
      covers: `Argomento del blocco ${block.id}`,
      keywords: index === 0 ? [data.mainKeyword] : [],
      words: 100,
      links: index === 0 ? data.linkablePages.map((page) => page.id) : [],
    })),
    images: [{ block: "INTRO", purpose: "Copertina", alt: `Foto per ${data.mainKeyword}`, subject: "A pair of running shoes on a track" }],
  };
}

/** Risposta di OpenRouter con il testo indicato del modello. */
export const modelReply = (content: unknown, model = "autore/modello-prova:free") =>
  Response.json({ model, choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] });

/** Dati di un blocco che la scrittura invia al modello (T-4201), letti dal messaggio dell'utente. */
export type SentSectionData = {
  mainKeyword: string;
  outline: { id: string; heading: string | null; covers: string }[];
  block: { id: string; heading: string | null; keywords: string[]; maxWords: number; links: { target: string; h1: string }[] };
  instruction?: string;
};

/** Dati delle domande frequenti inviati al modello (T-4202). */
export type SentFaqData = { mainKeyword: string; questionKeywords: string[]; otherKeywords: string[]; instruction?: string };

/** Messaggio dell'utente di una chiamata catturata, letto come JSON. */
export const sentData = <T>(init: RequestInit | undefined): T => JSON.parse(sentBody(init).messages[1].content) as T;

/** Testo valido di un blocco (T-4201): la keyword principale nella prima frase e un link a ogni pagina del blocco. */
export function sectionReply(data: SentSectionData): string {
  const links = data.block.links.map((link) => `[${link.h1}](${link.target})`).join(" e ");
  const opening = `Chi cerca ${data.mainKeyword} trova qui il blocco ${data.block.id}.`;
  return links ? `${opening}\n\nPer approfondire leggi ${links}.` : opening;
}

const FAQ_ANSWER = "La risposta dipende da come corri, da quanti chilometri fai ogni settimana e dal terreno: prova le scarpe in negozio prima di scegliere il modello giusto.";

/**
 * Quattro coppie valide di domande frequenti (T-4202): dalle keyword-domanda finché ci sono, poi domande generiche
 * senza la keyword principale, così il blocco non supera la densità dei controlli (T-4302).
 */
export function faqReply(data: SentFaqData) {
  return {
    faq: [0, 1, 2, 3].map((index) => ({
      question: `${data.questionKeywords[index] ?? `Domanda ${index + 1} sul tema`}?`,
      answer: FAQ_ANSWER,
    })),
  };
}

/** Risposta valida di OpenRouter per qualunque richiesta del lavoro: scaletta (T-4102), blocco (T-4201) o FAQ (T-4202). */
export function articleCompletion(init: RequestInit | undefined): Response {
  const data = sentData<Record<string, unknown>>(init);
  if ("block" in data) return modelReply(sectionReply(data as unknown as SentSectionData));
  if ("questionKeywords" in data) return modelReply(faqReply(data as unknown as SentFaqData));
  return modelReply(outlineReply(data as unknown as SentOutlineData));
}
