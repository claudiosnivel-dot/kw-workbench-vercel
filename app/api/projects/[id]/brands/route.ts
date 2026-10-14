import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { addProjectBrand, listProjectBrands } from "@/lib/modules/project-brands";

/** Marchi dei concorrenti del progetto (T-2601): lettura con project.read, fuori dal workspace 404. */
export const GET = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const project = await requireProjectAccess(user, id, "project.read", {});
  return NextResponse.json({ data: await listProjectBrands(project.id) });
});

/** Aggiunge un marchio e lo applica subito alle keyword già trovate (T-2601): scrittura con project.update. */
export const POST = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const project = await requireProjectAccess(user, id, "project.update", {});
  return NextResponse.json({ data: await addProjectBrand(project, await request.json()) }, { status: 201 });
});
