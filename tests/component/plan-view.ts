// Viste del piano scritte a mano per i test di componente del piano (T-6802, T-6902, T-7001, T-7002): keyword, pagine e
// strategia con i campi minimi, più la risposta JSON di fetch.
import type { StrategyKeywordView, StrategyPageView, StrategyView } from "@/lib/modules/strategy/types";

/** Keyword secondaria senza segni; extra cambia ruolo, angolo, consiglio o riga di origine. */
export const keyword = (id: string, text: string, volume: number | null, extra: Partial<StrategyKeywordView> = {}): StrategyKeywordView => ({
  id,
  keyword: text,
  canonical: text,
  role: "SECONDARY",
  volume,
  score: 50,
  isQuestion: false,
  angle: false,
  ...extra,
});

/** Spoke da scrivere sotto la pagina P; extra dà H1, keyword e il resto. */
export const page = (id: string, extra: Partial<StrategyPageView> & Pick<StrategyPageView, "h1" | "keywords">): StrategyPageView => ({
  id,
  kind: "SPOKE",
  hubPageId: "P",
  h2: [],
  h1Edited: false,
  h2Edited: false,
  contentType: "guide",
  priority: 0,
  position: 0,
  reason: { code: "SPOKE_SERP", params: { count: 1, faq: 0 } },
  status: "TODO",
  statusChangedAt: null,
  publishedUrl: null,
  aiProposal: null,
  ...extra,
});

/** Piano s1 del progetto p1 con gli hub dati e la version indicata. */
export function strategy(hubs: StrategyView["hubs"], version = 4): StrategyView {
  return {
    id: "s1",
    name: "Piano",
    mode: "AUTO",
    language: "it",
    createdAt: "2026-11-15T10:00:00.000Z",
    consideredCount: 4,
    assignedCount: 4,
    unassignedCount: 0,
    truncated: false,
    version,
    pageCount: hubs.reduce((sum, hub) => sum + 1 + hub.spokes.length, 0),
    projectId: "p1",
    settings: {},
    groupingSource: "SERP",
    groupingNotice: null,
    hubs,
    unassigned: [],
  };
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
