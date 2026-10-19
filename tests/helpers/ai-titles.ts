import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { DELETE as discardRoute, POST as suggestRoute } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/titles/suggest/route";
import type { AiTitlesSettings } from "@/lib/ai/settings";
import { upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "./auth";
import { callRoute } from "./http";
import { insertStrategy } from "./strategy";

/*
 * Supporto dei test dei titoli con l'AI (T-3601, T-3602): impostazioni salvate come le salva la card del root admin,
 * risposte simulate di OpenRouter e piani con un MEMBER del workspace.
 */

export type Session = Awaited<ReturnType<typeof createUserWithSession>>;
export type PlanPage = { projectId: string; strategyId: string; pageId: string };

/**
 * Impostazioni dei titoli con l'AI salvate in app_settings (cifrata): funzione accesa e un solo modello salvo
 * indicazione contraria.
 */
// impacted-by: T-3801 (elenco ordinato dei modelli al posto del modello unico)
export async function saveAiSettings(settings: Partial<AiTitlesSettings> = {}): Promise<void> {
  const value: AiTitlesSettings = { enabled: true, models: ["autore/modello-prova:free"], platformDailyLimit: 45, workspaceDailyLimit: 10, ...settings };
  await upsertSettingValue({ key: "AI_TITLES_SETTINGS", value: JSON.stringify(value) });
}

/** Chiave di OpenRouter generata a ogni esecuzione e base fittizia: nessuna chiamata esce dal test. */
export function stubOpenRouterEnv(): void {
  vi.stubEnv("OPENROUTER_API_KEY", randomUUID());
  vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.test/api/v1");
}

/** Risposta di OpenRouter con il testo del modello: un oggetto JSON { h1, h2 }. */
export function completion(titles: { h1: string; h2: string[] }, model = "autore/modello-prova:free"): Response {
  return new Response(JSON.stringify({ model, choices: [{ message: { content: JSON.stringify(titles) } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const failure = () => new Response("{}", { status: 500 });

/**
 * Strategia con un hub e uno spoke con la principale 'scarpe running donna', in un progetto nuovo del workspace del
 * proprietario o in quello indicato (con createdAt più vecchio è una versione precedente, T-2502).
 */
export async function insertPlan(owner: Session, options: { projectName?: string; projectId?: string; createdAt?: Date } = {}) {
  const projectId =
    options.projectId ??
    (await prisma.project.create({ data: { name: options.projectName ?? "Progetto", workspace_id: owner.workspaceId, language_code: "it" } })).id;
  const plan = await insertStrategy({
    projectId,
    version: 3,
    createdAt: options.createdAt,
    pages: [
      { key: "hub", kind: "HUB", keywords: [{ text: "scarpe running", volume: 9900 }] },
      {
        key: "spoke",
        kind: "SPOKE",
        hub: "hub",
        keywords: [
          { text: "scarpe running donna", volume: 2100 },
          { text: "scarpe running donna ammortizzate", volume: 320 },
        ],
      },
    ],
  });
  return { projectId, ...plan };
}

/** MEMBER nel workspace di un nuovo proprietario, con il piano di insertPlan. */
export async function memberWithPlan(label: string, options: { projectName?: string } = {}) {
  const owner = await createUserWithSession({ displayName: `${label}-owner-${randomUUID().slice(0, 8)}` });
  const member = await createUserWithSession({ displayName: `${label}-member-${randomUUID().slice(0, 8)}` });
  await prisma.membership.create({ data: { workspace_id: owner.workspaceId, user_id: member.user.id, role: "MEMBER" } });
  const plan = await insertPlan(owner, options);
  return { owner, member, plan, spoke: { projectId: plan.projectId, strategyId: plan.strategyId, pageId: plan.pageIds.spoke } };
}

function titlesCall(handler: typeof suggestRoute | typeof discardRoute, method: string, cookie: string | undefined, page: PlanPage) {
  return callRoute(handler, {
    method,
    url: `/api/projects/${page.projectId}/strategies/${page.strategyId}/pages/${page.pageId}/titles/suggest`,
    cookie,
    params: { id: page.projectId, strategyId: page.strategyId, pageId: page.pageId },
  });
}

export const suggest = (cookie: string | undefined, page: PlanPage) => titlesCall(suggestRoute, "POST", cookie, page);
export const discard = (cookie: string | undefined, page: PlanPage) => titlesCall(discardRoute, "DELETE", cookie, page);

export const pageRow = (id: string) =>
  prisma.strategyPage.findUniqueOrThrow({
    where: { id },
    select: { h1: true, h2: true, h1_edited: true, h2_edited: true, ai_proposal: true },
  });

export async function strategyVersion(id: string): Promise<number> {
  return (await prisma.strategy.findUniqueOrThrow({ where: { id }, select: { version: true } })).version;
}
