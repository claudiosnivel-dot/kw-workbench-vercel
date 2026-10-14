import { type NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { keywordsHref } from "@/lib/modules/results-view";

/**
 * Vecchio indirizzo della pagina Sezioni (T-2603): 308 verso le keyword del progetto; gli argomenti si aggiungono,
 * riordinano ed eliminano dalla barra laterale e dal loro menu ⋯. Progetto fuori dal workspace: 404.
 */
export const GET = withUserRoute(async (request: NextRequest, user, { id }: ProjectParams) => {
  const project = await requireProjectAccess(user, id, "project.read", {});
  return NextResponse.redirect(new URL(keywordsHref(project.id, { view: "all" }), request.nextUrl.origin), 308);
});
