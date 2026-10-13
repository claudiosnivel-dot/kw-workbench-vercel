/**
 * Prossimo passo del percorso di un progetto (T-2302, D-39): idea → keyword → piano. Modulo puro, senza Prisma, così i
 * componenti ne importano i tipi senza raggiungere il database (D-22).
 */

/** Stato di un argomento (sezione) del progetto, in ordine di position. */
export type TopicProgressState = {
  id: string;
  /** Keyword tenute: review_status diverso da rejected e brand_status diverso da excluded. */
  keptCount: number;
  totalCount: number;
  seedCount: number;
  /** Job di estrazione pending o running dell'argomento, se c'è. */
  activeJobId: string | null;
};

export type ProjectProgressState = {
  topics: TopicProgressState[];
  latestStrategyId: string | null;
};

export type StepStatus = "done" | "current" | "todo";

export type NextStep =
  | { kind: "add_topic" }
  | { kind: "searching"; topicId: string; jobId: string }
  | { kind: "run_topic"; topicId: string }
  | { kind: "build_plan" }
  | { kind: "open_plan"; strategyId: string };

export type ProjectProgress = {
  steps: { keywords: StepStatus; plan: StepStatus };
  next: NextStep;
};

export type TopicProgress = TopicProgressState & { name: string };

/** Stato del percorso di un progetto letto dal DB (lib/modules/project-progress.ts) e passato ai componenti. */
export type ProjectProgressData = ProjectProgress & {
  topics: TopicProgress[];
  keptCount: number;
  latestStrategy: { id: string; pageCount: number } | null;
};

/**
 * Tappe e prossimo passo, in quest'ordine: nessun argomento → add_topic; un job attivo → searching (il primo argomento
 * che ne ha uno); nessuna keyword tenuta → run_topic sul primo argomento con almeno una seed (add_topic se nessuno ne
 * ha); keyword tenute senza strategia → build_plan; strategia presente → open_plan. La tappa Keyword è fatta solo con
 * keyword tenute e nessuna ricerca in corso; la tappa Piano è fatta quando esiste una strategia.
 */
export function computeProjectProgress(state: ProjectProgressState): ProjectProgress {
  const plan: StepStatus = state.latestStrategyId ? "done" : "todo";
  const keywordsCurrent = (next: NextStep): ProjectProgress => ({ steps: { keywords: "current", plan }, next });

  if (state.topics.length === 0) {
    return keywordsCurrent({ kind: "add_topic" });
  }

  const searching = state.topics.find((topic) => topic.activeJobId !== null);
  if (searching?.activeJobId) {
    return keywordsCurrent({ kind: "searching", topicId: searching.id, jobId: searching.activeJobId });
  }

  if (state.topics.every((topic) => topic.keptCount === 0)) {
    const runnable = state.topics.find((topic) => topic.seedCount > 0);
    return keywordsCurrent(runnable ? { kind: "run_topic", topicId: runnable.id } : { kind: "add_topic" });
  }

  if (!state.latestStrategyId) {
    return { steps: { keywords: "done", plan: "current" }, next: { kind: "build_plan" } };
  }

  return { steps: { keywords: "done", plan: "done" }, next: { kind: "open_plan", strategyId: state.latestStrategyId } };
}

/** Parametro dei risultati con il code che ha impedito l'avvio della ricerca (avvio rapido e nuovo argomento). */
export const EXTRACTION_BLOCKED_PARAM = "extraction";

/** Pagina della strategia indicata, oppure la pagina Strategia del progetto (T-2302, T-2303). */
export function strategyHref(projectId: string, strategyId?: string | null): string {
  return strategyId ? `/projects/${projectId}/strategy/${strategyId}` : `/projects/${projectId}/strategy`;
}
