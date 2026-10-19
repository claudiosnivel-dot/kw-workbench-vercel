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
