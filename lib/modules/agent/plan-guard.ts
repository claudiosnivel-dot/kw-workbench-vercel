import { AppError } from "@/lib/http/errors";
import type { EditorState, PagePatch, StrategyOperation } from "@/lib/modules/strategy/editor";

// Guardia delle pagine iniziate per Claude Code (T-7502, anti-obiettivo 2 di D-64): sul piano letto dopo la presa della
// version, prima della modifica, così un rifiuto annulla la transazione e il piano non cambia. Vale solo per il server
// MCP: nell'app l'utente resta libero. Gli id che il piano non ha passano oltre: li rifiuta l'editor (404).

/** Pagina non «Da scrivere» che Claude Code non può svuotare, unire, spostare o ritoccare: 409 con il suo id. */
export class AgentPageLockedError extends AppError {
  constructor(pageId: string) {
    super(409, "AGENT_PAGE_LOCKED", "La pagina non è più da scrivere", { pageId });
    this.name = "AgentPageLockedError";
  }
}

/** Lancia AgentPageLockedError per la prima pagina indicata che esiste nel piano e non è TODO. */
function assertWritable(state: EditorState, pageIds: (string | null | undefined)[]): void {
  for (const pageId of pageIds) {
    const page = pageId ? state.pages.find((candidate) => candidate.id === pageId) : undefined;
    if (page && page.status !== "TODO") throw new AgentPageLockedError(page.id);
  }
}

/** Pagine da cui escono le keyword indicate (le non assegnate non hanno pagina). */
function sourcePagesOf(state: EditorState, keywordIds: string[]): (string | null)[] {
  const wanted = new Set(keywordIds);
  return state.keywords.filter((keyword) => wanted.has(keyword.id)).map((keyword) => keyword.pageId);
}

/**
 * Operazione di Claude Code: merge_pages con sorgente o destinazione non «Da scrivere» (e, per una sorgente hub, con
 * spoke non «Da scrivere» che cambierebbero pagina principale), move_keywords e create_page che tolgono keyword da una
 * pagina non «Da scrivere», move_page e promote_to_hub di una pagina non «Da scrivere». Aggiungere keyword o spoke a una
 * pagina iniziata e keep_angle restano permessi.
 */
export function guardAgentOperation(state: EditorState, operation: StrategyOperation): void {
  switch (operation.type) {
    case "merge_pages": {
      const spokes = state.pages.filter((page) => page.hubPageId === operation.sourcePageId && page.id !== operation.targetPageId);
      assertWritable(state, [operation.sourcePageId, operation.targetPageId, ...spokes.map((page) => page.id)]);
      return;
    }
    case "move_keywords":
    case "create_page":
      assertWritable(state, sourcePagesOf(state, operation.keywordIds));
      return;
    case "move_page":
    case "promote_to_hub":
    case "delete_page":
      assertWritable(state, [operation.pageId]);
      return;
    case "keep_angle":
      return;
  }
}

/** Modifica di una pagina da Claude Code: su una pagina non «Da scrivere» solo status e publishedUrl. */
export function guardAgentPagePatch(state: EditorState, pageId: string, patch: PagePatch): void {
  if (patch.h1 !== undefined || patch.h2 !== undefined || patch.contentType !== undefined) {
    assertWritable(state, [pageId]);
  }
}
