import { DELETE as cancelRunRoute } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/article/run/route";
import { GET as readRoute, POST as startRoute } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/article/route";
import type { AiSettings } from "@/lib/ai/settings";
import { upsertSettingValue } from "@/lib/integrations/app-settings";
import type { PlanPage } from "./ai-titles";
import { callRoute } from "./http";

/*
 * Supporto dei test degli articoli (T-4002): impostazioni dell'AI con gli articoli accesi, salvate come le salva la card
 * del root admin, e le rotte dell'articolo di una pagina del piano.
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

/** Risposta di OpenRouter con la scaletta valida per i dati della richiesta ricevuta. */
export function outlineCompletion(init: RequestInit | undefined): Response {
  const data = JSON.parse(sentBody(init).messages[1].content) as SentOutlineData;
  return modelReply(outlineReply(data));
}
