import { NextResponse } from "next/server";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { deleteProject, patchProject } from "@/lib/modules/project-update";

export const PATCH = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const payload: unknown = await request.json();

  // Aggiornamento parziale (T-809): solo i campi inviati, validati da uno schema strict.
  const updated = await patchProject(user, id, payload);
  return NextResponse.json({ data: updated });
});

export const DELETE = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  await deleteProject(user, id);
  return NextResponse.json({ success: true });
});
