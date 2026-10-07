import { AppError } from "@/lib/http/errors";

/**
 * 404 delle rotte di progetto (T-503, T-1303): withApiErrors lo trasforma nel body { error, code, requestId }, uguale
 * in ogni rotta; mai un 403 che riveli l'esistenza del progetto di un workspace di cui l'utente non è membro (CWE-639).
 * L'accesso per workspace e ruolo sta in lib/authz/workspace.ts (T-1502).
 */
export class ProjectNotFoundError extends AppError {
  constructor() {
    super(404, "PROJECT_NOT_FOUND", "Progetto non trovato");
    this.name = "ProjectNotFoundError";
  }
}

/** 404 delle rotte di sezione (T-503, T-1303). */
export class SectionNotFoundError extends AppError {
  constructor() {
    super(404, "SECTION_NOT_FOUND", "Sezione non trovata");
    this.name = "SectionNotFoundError";
  }
}
