import { ValidationError } from "@/lib/http/errors";
import { compareKeywordPriority } from "@/lib/modules/strategy/cluster";
import { buildPageTitles, type TitleContext, type TitleKeyword, type TitlePage } from "@/lib/modules/strategy/titles";
import type {
  StrategyContentType,
  StrategyKeywordView,
  StrategyPageStatus,
  StrategyPageView,
} from "@/lib/modules/strategy/types";

/*
 * Modifiche al piano in memoria (T-1904): funzioni pure su uno stato caricato dalla strategia. Dopo ogni operazione
 * valgono sempre le regole del piano: una sola keyword principale per pagina (se esce, diventa principale la secondaria
 * più prioritaria), nessuna pagina senza keyword, gli spoke di un hub eliminato diventano hub, position è l'indice
 * nell'ordine di lavoro (T-2501). I titoli non modificati dall'utente delle pagine toccate si ricalcolano: l'H1 se
 * cambia la principale o il tipo, gli H2 se cambiano le keyword o gli spoke.
 */

/** Keyword nello stato del piano: quella della vista con la sua pagina (null per le non assegnate). */
export type EditorKeyword = StrategyKeywordView & { pageId: string | null };

/**
 * Pagina nello stato del piano: quella della vista senza le keyword, che stanno in EditorState.keywords, e senza la
 * proposta dell'AI, che le modifiche del piano non toccano (T-3602).
 */
export type EditorPage = Omit<StrategyPageView, "keywords" | "aiProposal">;

export type EditorState = { pages: EditorPage[]; keywords: EditorKeyword[] };

export type StrategyOperation =
  | { type: "move_keywords"; keywordIds: string[]; targetPageId: string | null }
  | { type: "promote_to_hub"; pageId: string }
  | { type: "merge_pages"; sourcePageId: string; targetPageId: string }
  | { type: "delete_page"; pageId: string }
  | { type: "move_page"; pageId: string; targetHubId: string };

export type PagePatch = {
  h1?: string;
  h2?: string[];
  contentType?: StrategyContentType;
  status?: StrategyPageStatus;
  /** Indirizzo della pagina pubblicata (T-4502), già validato: https assoluto. */
  publishedUrl?: string;
};

/** Id di pagina o keyword che non appartiene alla strategia del percorso (CWE-639): diventa 404 STRATEGY_NOT_FOUND. */
export class UnknownStrategyItemError extends Error {
  constructor() {
    super("Elemento non presente nella strategia");
    this.name = "UnknownStrategyItemError";
  }
}

// Massimo della colonna Int di Postgres (CWE-190).
const INT4_MAX = 2_147_483_647;

type Editor = {
  state: EditorState;
  /** Pagine le cui keyword o i cui spoke sono cambiati. */
  dirty: Set<string>;
  /** Pagine il cui tipo di contenuto è cambiato. */
  retyped: Set<string>;
  originalMain: Map<string, string | undefined>;
};

function cloneState(state: EditorState): EditorState {
  return {
    pages: state.pages.map((page) => ({ ...page, h2: [...page.h2], reason: { ...page.reason } })),
    keywords: state.keywords.map((keyword) => ({ ...keyword })),
  };
}

function pageOf(editor: Editor, pageId: string): EditorPage {
  const page = editor.state.pages.find((item) => item.id === pageId);
  if (!page) throw new UnknownStrategyItemError();
  return page;
}

const keywordsOf = (state: EditorState, pageId: string) => state.keywords.filter((keyword) => keyword.pageId === pageId);
const spokesOf = (state: EditorState, hubId: string) => state.pages.filter((page) => page.hubPageId === hubId);

function markDirty(editor: Editor, pageId: string | null): void {
  if (!pageId) return;
  editor.dirty.add(pageId);
  const page = editor.state.pages.find((item) => item.id === pageId);
  if (page?.hubPageId) editor.dirty.add(page.hubPageId);
}

/** Toglie la pagina: le sue keyword diventano non assegnate e, se è un hub, i suoi spoke diventano hub. */
function removePage(editor: Editor, page: EditorPage): void {
  for (const keyword of keywordsOf(editor.state, page.id)) {
    keyword.pageId = null;
    keyword.role = "SECONDARY";
  }
  for (const spoke of spokesOf(editor.state, page.id)) {
    spoke.kind = "HUB";
    spoke.hubPageId = null;
    editor.dirty.add(spoke.id);
  }
  markDirty(editor, page.hubPageId);
  editor.state.pages = editor.state.pages.filter((item) => item !== page);
  editor.dirty.delete(page.id);
}

function moveKeywords(editor: Editor, keywordIds: string[], targetPageId: string | null): void {
  const ids = new Set(keywordIds);
  const moved = editor.state.keywords.filter((keyword) => ids.has(keyword.id));
  if (moved.length !== ids.size) throw new UnknownStrategyItemError();
  if (targetPageId) pageOf(editor, targetPageId);

  for (const keyword of moved) {
    if (keyword.pageId === targetPageId) continue;
    markDirty(editor, keyword.pageId);
    markDirty(editor, targetPageId);
    keyword.pageId = targetPageId;
    keyword.role = "SECONDARY";
  }
}

function promoteToHub(editor: Editor, pageId: string): void {
  const page = pageOf(editor, pageId);
  if (page.kind === "HUB") throw new ValidationError("La pagina è già un hub");
  markDirty(editor, page.id);
  page.kind = "HUB";
  page.hubPageId = null;
}

function mergePages(editor: Editor, sourcePageId: string, targetPageId: string): void {
  const source = pageOf(editor, sourcePageId);
  const target = pageOf(editor, targetPageId);
  if (source === target) throw new ValidationError("Le pagine da unire devono essere diverse");

  if (source.kind === "HUB") {
    // Gli spoke dell'hub assorbito seguono l'hub che lo assorbe; se la destinazione era un suo spoke, diventa hub.
    if (target.hubPageId === source.id) {
      target.kind = "HUB";
      target.hubPageId = null;
    }
    const newHub = target.kind === "HUB" ? target.id : target.hubPageId;
    for (const spoke of spokesOf(editor.state, source.id)) {
      if (spoke === target) continue;
      spoke.hubPageId = newHub;
      spoke.kind = newHub ? "SPOKE" : "HUB";
    }
  }
  for (const keyword of keywordsOf(editor.state, source.id)) {
    keyword.pageId = target.id;
    keyword.role = "SECONDARY";
  }
  markDirty(editor, target.id);
  removePage(editor, source);
}

function deletePage(editor: Editor, pageId: string): void {
  removePage(editor, pageOf(editor, pageId));
}

/** Uno spoke sotto un altro hub della strategia (T-2503): va in fondo ai suoi spoke, gli H2 dei due hub si ricalcolano. */
function movePage(editor: Editor, pageId: string, targetHubId: string): void {
  const page = pageOf(editor, pageId);
  const target = pageOf(editor, targetHubId);
  if (page.kind !== "SPOKE") throw new ValidationError("Si sposta solo un approfondimento");
  if (target.kind !== "HUB" || target.id === page.hubPageId) {
    throw new ValidationError("La destinazione deve essere un'altra pagina principale");
  }
  markDirty(editor, page.hubPageId);
  editor.dirty.add(target.id);
  const last = Math.max(target.position, ...spokesOf(editor.state, target.id).map((spoke) => spoke.position));
  page.hubPageId = target.id;
  // Dopo l'ultimo spoke della destinazione: la numerazione dell'ordine di lavoro lo riporta a un intero.
  page.position = last + 0.5;
}

/**
 * Ordine di lavoro come lo mostra il piano: gli hub (e gli spoke senza un hub) in ordine di position, ciascuno seguito
 * dai propri spoke in ordine di position; position diventa l'indice in quest'ordine (T-2501).
 */
function renumber(state: EditorState): void {
  const sorted = [...state.pages].sort((a, b) => a.position - b.position);
  const hubIds = new Set(sorted.filter((page) => page.kind === "HUB").map((page) => page.id));
  const isColumn = (page: EditorPage) => page.kind === "HUB" || !page.hubPageId || !hubIds.has(page.hubPageId);
  let index = 0;
  for (const hub of sorted.filter(isColumn)) {
    hub.position = index++;
    for (const spoke of sorted.filter((page) => !isColumn(page) && page.hubPageId === hub.id)) {
      spoke.position = index++;
    }
  }
}

/** Regole del piano dopo una modifica: pagine vuote eliminate, una principale per pagina, priorità aggiornate. */
function normalize(editor: Editor): void {
  for (const page of [...editor.state.pages]) {
    if (keywordsOf(editor.state, page.id).length === 0) removePage(editor, page);
  }

  const usesVolume = editor.state.keywords.some((keyword) => keyword.volume !== null);
  for (const page of editor.state.pages) {
    const keywords = keywordsOf(editor.state, page.id).sort(compareKeywordPriority);
    const mains = keywords.filter((keyword) => keyword.role === "MAIN");
    if (mains.length !== 1) {
      const main = mains.sort(compareKeywordPriority)[0] ?? keywords[0];
      for (const keyword of keywords) keyword.role = keyword === main ? "MAIN" : "SECONDARY";
      markDirty(editor, page.id);
    }
    const total = keywords.reduce((sum, keyword) => sum + (usesVolume ? (keyword.volume ?? 0) : (keyword.score ?? 0)), 0);
    page.priority = Math.min(INT4_MAX, Math.round(total));
  }
}

function titleKeyword(keyword: EditorKeyword): TitleKeyword {
  return { keyword: keyword.keyword, canonical: keyword.canonical, isQuestion: keyword.isQuestion };
}

/** Spoke dell'hub in ordine di priorità, a parità di position. */
export function orderedSpokes(state: EditorState, hubId: string): EditorPage[] {
  return spokesOf(state, hubId).sort((a, b) => b.priority - a.priority || a.position - b.position);
}

/** Pagina da titolare nello stato corrente: secondarie per priorità e, per la pilastro, le principali dei suoi spoke. */
export function titlePageOf(state: EditorState, page: EditorPage): TitlePage {
  const keywords = keywordsOf(state, page.id).sort(compareKeywordPriority);
  const main = keywords.find((keyword) => keyword.role === "MAIN") ?? keywords[0];
  return {
    kind: page.kind,
    contentType: page.contentType,
    main: titleKeyword(main),
    secondary: keywords.filter((keyword) => keyword !== main).map(titleKeyword),
    spokeMains:
      page.kind === "HUB"
        ? orderedSpokes(state, page.id).flatMap((spoke) =>
            keywordsOf(state, spoke.id).filter((keyword) => keyword.role === "MAIN").map(titleKeyword)
          )
        : undefined,
  };
}

/** Titoli suggeriti della pagina nello stato corrente. */
export function suggestedTitles(state: EditorState, page: EditorPage, context: TitleContext): { h1: string; h2: string[] } {
  return buildPageTitles(titlePageOf(state, page), context);
}

function refreshTitles(editor: Editor, context: TitleContext): void {
  for (const page of editor.state.pages) {
    const mainChanged =
      editor.originalMain.get(page.id) !==
      keywordsOf(editor.state, page.id).find((keyword) => keyword.role === "MAIN")?.id;
    const touched = editor.dirty.has(page.id) || editor.retyped.has(page.id);
    if (!touched) continue;
    const titles = suggestedTitles(editor.state, page, context);
    if (!page.h1Edited && (mainChanged || editor.retyped.has(page.id))) page.h1 = titles.h1;
    if (!page.h2Edited) page.h2 = titles.h2;
  }
}

function startEditor(state: EditorState): Editor {
  const copy = cloneState(state);
  return {
    state: copy,
    dirty: new Set(),
    retyped: new Set(),
    originalMain: new Map(
      copy.pages.map((page) => [page.id, keywordsOf(copy, page.id).find((keyword) => keyword.role === "MAIN")?.id])
    ),
  };
}

/** Applica un'operazione di struttura (T-1904) e restituisce il nuovo stato con le regole del piano rispettate. */
export function applyOperation(state: EditorState, operation: StrategyOperation, context: TitleContext): EditorState {
  const editor = startEditor(state);
  switch (operation.type) {
    case "move_keywords":
      moveKeywords(editor, operation.keywordIds, operation.targetPageId);
      break;
    case "promote_to_hub":
      promoteToHub(editor, operation.pageId);
      break;
    case "merge_pages":
      mergePages(editor, operation.sourcePageId, operation.targetPageId);
      break;
    case "delete_page":
      deletePage(editor, operation.pageId);
      break;
    case "move_page":
      movePage(editor, operation.pageId, operation.targetHubId);
      break;
  }
  normalize(editor);
  renumber(editor.state);
  refreshTitles(editor, context);
  return editor.state;
}

/**
 * Modifica dei titoli, del tipo o dello stato di una pagina (T-1904, T-2501): un H1 o gli H2 inviati diventano
 * «modificati» e non si ricalcolano più; un tipo nuovo ricalcola i titoli non modificati; uno stato nuovo registra
 * l'istante del cambio e non tocca i titoli; un indirizzo della pagina pubblicata (T-4502) sostituisce il precedente.
 */
export function applyPagePatch(
  state: EditorState,
  pageId: string,
  patch: PagePatch,
  context: TitleContext,
  now: Date = new Date()
): EditorState {
  const editor = startEditor(state);
  const page = pageOf(editor, pageId);
  if (patch.status && patch.status !== page.status) {
    page.status = patch.status;
    page.statusChangedAt = now.toISOString();
  }
  if (patch.publishedUrl !== undefined) page.publishedUrl = patch.publishedUrl;
  if (patch.contentType && patch.contentType !== page.contentType) {
    page.contentType = patch.contentType;
    editor.retyped.add(page.id);
  }
  if (patch.h1 !== undefined) {
    page.h1 = patch.h1;
    page.h1Edited = true;
  }
  if (patch.h2 !== undefined) {
    page.h2 = patch.h2;
    page.h2Edited = true;
  }
  refreshTitles(editor, context);
  return editor.state;
}
