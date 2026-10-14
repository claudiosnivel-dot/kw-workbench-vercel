import { type NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { planHref } from "@/lib/modules/next-step";

/** Vecchio indirizzo della pagina Strategia (T-2502): 308 verso il piano del progetto. Progetto fuori dal workspace: 404. */
export const GET = withUserRoute(async (request: NextRequest, user, { id }: ProjectParams) => {
  const project = await requireProjectAccess(user, id, "project.read", {});
  return NextResponse.redirect(new URL(planHref(project.id), request.nextUrl.origin), 308);
});
