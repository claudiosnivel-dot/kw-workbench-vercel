import { type NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { keywordsHref, resolveResultsView, viewTarget } from "@/lib/modules/results-view";

/**
 * Vecchio indirizzo della pagina dei risultati (T-2403): 308 verso la pagina delle keyword con gli stessi filtri.
 * view=all porta alla vista del progetto, subprojectId all'argomento, nessuno dei due all'argomento predefinito (D-21);
 * un argomento di un altro progetto porta al suo indirizzo, che risponde 404. Progetto fuori dal workspace: 404.
 */
export const GET = withUserRoute(async (request: NextRequest, user, { id }: ProjectParams) => {
  const project = await requireProjectAccess(user, id, "project.read", {
    default_subproject_id: true,
    subprojects: { select: { id: true, position: true } },
  });
  const params = request.nextUrl.searchParams;
  const view = resolveResultsView({
    subprojects: project.subprojects,
    defaultSubprojectId: project.default_subproject_id,
    searchParams: params,
  });
  const target = view.kind === "not-found" ? { subprojectId: (params.get("subprojectId") ?? "").trim() } : viewTarget(view);

  return NextResponse.redirect(new URL(keywordsHref(project.id, target, params), request.nextUrl.origin), 308);
});
