/**
 * Prossimo passo del percorso di un progetto (T-2302, T-2506, D-39): idea → keyword → piano → scrittura. Modulo puro,
 * senza Prisma, così i componenti ne importano i tipi senza raggiungere il database (D-22).
 */

/** Stato di un argomento (sezione) del progetto, in ordine di position. */
export type TopicProgressState = {
  id: string;
  /** Keyword tenute: review_status diverso da rejected (regola unica tieni/scarta, T-2401). */
  keptCount: number;
  totalCount: number;
  seedCount: number;
  /** Job di estrazione pending o running dell'argomento, se c'è. */
  activeJobId: string | null;
};

/** Pagina del piano da proporre: id, H1 e numero nell'ordine di lavoro (da 1). */
export type PlanPageRef = { id: string; h1: string; number: number };

/**
 * Scrittura del piano (T-2506): pagine per stato, la prima da scrivere nell'ordine di lavoro e la version del piano,
 * che serve a «Inizia a scriverla» per cambiarne lo stato.
 */
export type PlanProgressState = {
  version: number;
  todo: number;
  writing: number;
  published: number;
  firstTodo: PlanPageRef | null;
};

export type ProjectProgressState = {
  topics: TopicProgressState[];
  latestStrategyId: string | null;
  /** Scrittura del piano; assente o con 0 pagine il piano si apre e basta (open_plan). */
  plan?: PlanProgressState;
};

export type StepStatus = "done" | "current" | "todo";

export type NextStep =
  | { kind: "add_topic" }
  | { kind: "searching"; topicId: string; jobId: string }
  | { kind: "run_topic"; topicId: string }
  | { kind: "build_plan" }
  | { kind: "open_plan"; strategyId: string }
  | { kind: "write_next"; strategyId: string; version: number; page: PlanPageRef }
  | { kind: "writing"; strategyId: string; count: number }
  | { kind: "plan_done" };

export type ProjectProgress = {
  steps: { keywords: StepStatus; plan: StepStatus; writing: StepStatus };
  next: NextStep;
};

export type TopicProgress = TopicProgressState & { name: string };

/** Stato del percorso di un progetto letto dal DB (lib/modules/project-progress.ts) e passato ai componenti. */
export type ProjectProgressData = ProjectProgress & {
  topics: TopicProgress[];
  keptCount: number;
  latestStrategy: { id: string; pageCount: number; publishedCount: number; writingCount: number } | null;
};

/**
 * Tappe e prossimo passo, in quest'ordine: nessun argomento → add_topic; un job attivo → searching (il primo argomento
 * che ne ha uno); nessuna keyword tenuta → run_topic sul primo argomento con almeno una seed (add_topic se nessuno ne
 * ha); keyword tenute senza strategia → build_plan; piano senza pagine → open_plan; pagine da scrivere → write_next con
 * la prima nell'ordine di lavoro; nessuna da scrivere e qualcuna in scrittura → writing; tutte pubblicate → plan_done.
 * La tappa Keyword è fatta solo con keyword tenute e nessuna ricerca in corso; la tappa Piano è fatta quando esiste una
 * strategia; la tappa Scrittura è in corso con un piano che ha pagine e fatta quando sono tutte pubblicate.
 */
export function computeProjectProgress(state: ProjectProgressState): ProjectProgress {
  const plan: StepStatus = state.latestStrategyId ? "done" : "todo";
  const keywordsCurrent = (next: NextStep): ProjectProgress => ({ steps: { keywords: "current", plan, writing: "todo" }, next });

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
    return { steps: { keywords: "done", plan: "current", writing: "todo" }, next: { kind: "build_plan" } };
  }

  const strategyId = state.latestStrategyId;
  const pages = state.plan ? state.plan.todo + state.plan.writing + state.plan.published : 0;
  if (!state.plan || pages === 0) {
    return { steps: { keywords: "done", plan: "done", writing: "todo" }, next: { kind: "open_plan", strategyId } };
  }

  const writingStep = (next: NextStep): ProjectProgress => ({ steps: { keywords: "done", plan: "done", writing: "current" }, next });
  if (state.plan.firstTodo) {
    return writingStep({ kind: "write_next", strategyId, version: state.plan.version, page: state.plan.firstTodo });
  }
  if (state.plan.writing > 0) {
    return writingStep({ kind: "writing", strategyId, count: state.plan.writing });
  }
  return { steps: { keywords: "done", plan: "done", writing: "done" }, next: { kind: "plan_done" } };
}

/** Parametro dei risultati con il code che ha impedito l'avvio della ricerca (avvio rapido e nuovo argomento). */
export const EXTRACTION_BLOCKED_PARAM = "extraction";

/** Raggruppamento della bacheca del piano (T-2504): per pagina principale (hub, il default) o per stato. */
export type PlanGroup = "hub" | "status";
/** Vista del piano (T-2504): bacheca o elenco. */
export type PlanView = "board" | "list";

/**
 * Pagina del piano del progetto (T-2502): group e view nell'URL (T-2504), page apre il pannello di una pagina (T-2505,
 * T-2506). Il piano è sempre la strategia più recente.
 */
export function planHref(projectId: string, options: { group?: PlanGroup; view?: PlanView; page?: string } = {}): string {
  const query = new URLSearchParams();
  if (options.group && options.group !== "hub") query.set("group", options.group);
  if (options.view) query.set("view", options.view);
  if (options.page) query.set("page", options.page);
  const search = query.toString();
  return `/projects/${projectId}/plan${search ? `?${search}` : ""}`;
}

/** Editor dell'articolo di una pagina del piano (T-4401). */
export function articleHref(projectId: string, pageId: string): string {
  return `/projects/${projectId}/plan/pages/${pageId}/article`;
}

/** Versioni precedenti del piano (T-2502). */
export function planVersionsHref(projectId: string): string {
  return `/projects/${projectId}/plan/versions`;
}

/** Versione precedente del piano, in sola lettura (T-2502). */
export function planVersionHref(projectId: string, strategyId: string): string {
  return `${planVersionsHref(projectId)}/${strategyId}`;
}
