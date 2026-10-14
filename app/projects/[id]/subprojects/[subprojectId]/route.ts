import { type NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type SectionParams, withUserRoute } from "@/lib/http/user-route";
import { keywordsHref } from "@/lib/modules/results-view";

/**
 * Vecchio indirizzo delle impostazioni di una sezione (T-2602): 308 verso la pagina dell'argomento, dove i suoi campi
 * vivono in Rinomina, Parole di partenza e Impostazioni diverse dal progetto. Un argomento di un altro progetto porta al
 * suo indirizzo, che risponde 404; progetto fuori dal workspace: 404.
 */
export const GET = withUserRoute(async (request: NextRequest, user, { id, subprojectId }: SectionParams) => {
  const project = await requireProjectAccess(user, id, "project.read", {});
  return NextResponse.redirect(new URL(keywordsHref(project.id, { subprojectId }), request.nextUrl.origin), 308);
});
