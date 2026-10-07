import type { AuthUser } from "@/lib/auth/credentials";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";

/** Parametri di percorso delle rotte /api/projects/[id] e /api/projects/[id]/subprojects/[subprojectId]. */
export type ProjectParams = { id: string };
export type SectionParams = { id: string; subprojectId: string };

/**
 * Rotta API con utente autenticato e parametri di percorso (T-1303): sessione verificata (401 AUTH_REQUIRED) e
 * parametri letti prima dell'handler, con il modello d'errore di withApiErrors. La proprietà della risorsa resta
 * all'handler (findOwnedProjectOr404, findOwnedSectionOr404, assertOwnedScope).
 */
export function withUserRoute<Req extends Request, Params>(
  handler: (request: Req, user: AuthUser, params: Params) => Promise<Response> | Response
) {
  return withApiErrors(async (request: Req, context: { params: Promise<Params> }) => {
    const user = await requireAuthenticatedUserFromRequest(request);
    return handler(request, user, await context.params);
  });
}
